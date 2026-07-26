import {
  execFileSync,
  spawn,
  spawnSync,
} from 'node:child_process';
import {
  createHash,
  randomBytes,
  randomUUID as systemRandomUUID,
} from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { tmpdir as systemTmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import { tsImport } from 'tsx/esm/api';

const RECEIPT_RELATIVE_PATH =
  '.superpowers/evidence/data-027/receipt.json';
const PUBLICATION_LOCK_FILE_NAME = 'publication.lock';
const OBSERVATION_BASE_DIRECTORY = 'touchcatch-data-027';
const LOCK_BASE_DIRECTORY = 'touchcatch-supabase-gate-locks';
const PROCESS_TERMINATION_TIMEOUT_MS = 10_000;
const PUBLICATION_LOCK_RETRY_MS = 50;
const PUBLICATION_LOCK_WAIT_TIMEOUT_MS = 1_800_000;
const gateRunIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const commitShaPattern = /^[a-f0-9]{40}$/u;
const targetOverrideKeys = new Set([
  'content_asset_origins',
  'local_mailpit_url',
  'local_supabase_api_url',
  'local_supabase_publishable_key',
  'local_supabase_secret_key',
  'node_env',
  'supabase_db_url',
  'supabase_project_id',
  'supabase_project_ref',
  'supabase_url',
  'supabase_workdir',
  'test_database_url',
  'touchcatch_data027_gate_run_id',
  'touchcatch_data027_observation_path',
]);

const errorCode = (code) => new Error(code);

const defaultGetCommitSha = (root) =>
  execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  }).trim();

const defaultResolveRepositoryRoot = (startPath) =>
  path.resolve(execFileSync(
    'git',
    ['-C', startPath, 'rev-parse', '--show-toplevel'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    },
  ).trim());

const defaultResolveSupabaseCliEntry = () => {
  const packageJsonPath = fileURLToPath(
    import.meta.resolve('supabase/package.json'),
  );
  const packageRoot = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const binPath = typeof packageJson.bin === 'string'
    ? packageJson.bin
    : packageJson.bin?.supabase;
  if (typeof binPath !== 'string' || binPath.length === 0) {
    throw errorCode('SUPABASE_GATE_FAILED:runner');
  }
  const entryPath = path.resolve(packageRoot, binPath);
  const relative = path.relative(packageRoot, entryPath);
  if (
    relative === ''
    || relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
    || !existsSync(entryPath)
    || !lstatSync(entryPath).isFile()
  ) {
    throw errorCode('SUPABASE_GATE_FAILED:runner');
  }
  return entryPath;
};

const sanitizeEnvironment = (source) => {
  const environment = { ...source };
  for (const key of Object.keys(environment)) {
    if (targetOverrideKeys.has(key.toLowerCase())) delete environment[key];
  }
  return environment;
};

const fixedGateErrorPattern =
  /^(?:SUPABASE_GATE_(?:DOCKER_UNAVAILABLE|TIMEOUT:[a-z0-9_]+|FAILED:[a-z0-9_]+)|DATA_027_OBSERVATION_(?:MISSING|INVALID))$/u;

const sanitizeGateError = (error) =>
  error instanceof Error && fixedGateErrorPattern.test(error.message)
    ? error
    : errorCode('SUPABASE_GATE_FAILED:runner');

export const terminateProcessTree = (child, platform, overrides = {}) => {
  const spawnSyncProcess = overrides.spawnSyncProcess ?? spawnSync;
  const killProcess = overrides.killProcess ?? process.kill;
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) return false;
  if (platform === 'win32') {
    try {
      const result = spawnSyncProcess(
        'taskkill',
        ['/PID', String(child.pid), '/T', '/F'],
        {
          shell: false,
          stdio: 'ignore',
          timeout: PROCESS_TERMINATION_TIMEOUT_MS,
          windowsHide: true,
        },
      );
      return result?.error === undefined
        && result?.status === 0
        && (result?.signal ?? null) === null;
    } catch {
      return false;
    }
  }
  try {
    killProcess(-child.pid, 'SIGKILL');
    return true;
  } catch {
    try {
      return child.kill('SIGKILL') === true;
    } catch {
      return false;
    }
  }
};

export const createDefaultSpawnStep = ({
  clearTimeout: clearTimer,
  now,
  platform,
  setTimeout: setTimer,
  spawnProcess = spawn,
  spawnSyncProcess = spawnSync,
  killProcess = process.kill,
  terminationTimeoutMs = PROCESS_TERMINATION_TIMEOUT_MS,
}) => (step) => new Promise((resolve) => {
  const startedAtMs = now();
  let child;
  let finished = false;
  let timeoutTriggered = false;
  let terminationCommandSucceeded = false;
  let timer;
  let terminationTimer;

  const finish = (result) => {
    if (finished) return;
    finished = true;
    if (timer !== undefined) clearTimer(timer);
    if (terminationTimer !== undefined) clearTimer(terminationTimer);
    resolve({ ...result, startedAtMs, endedAtMs: now() });
  };

  try {
    child = spawnProcess(step.executable, [...step.args], {
      cwd: step.cwd,
      detached: platform !== 'win32',
      env: step.env,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch {
    finish({
      status: null,
      timedOut: false,
      terminationConfirmed: true,
    });
    return;
  }

  child.once('error', () => {
    finish({
      status: null,
      timedOut: timeoutTriggered,
      terminationConfirmed: !timeoutTriggered
        || terminationCommandSucceeded,
    });
  });
  child.once('close', (status) => {
    finish({
      status,
      timedOut: timeoutTriggered,
      terminationConfirmed: !timeoutTriggered
        || terminationCommandSucceeded,
    });
  });

  timer = setTimer(() => {
    timeoutTriggered = true;
    terminationCommandSucceeded = terminateProcessTree(child, platform, {
      killProcess,
      spawnSyncProcess,
    });
    terminationTimer = setTimer(() => {
      finish({
        status: null,
        timedOut: true,
        terminationConfirmed: false,
      });
    }, terminationTimeoutMs);
  }, step.timeoutMs);
  if (finished) clearTimer(timer);
});

const assertSafeExistingDirectory = (target, errorMessage) => {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (
    const component of absolute
      .slice(parsed.root.length)
      .split(/[\\/]/u)
      .filter(Boolean)
  ) {
    current = path.join(current, component);
    if (!existsSync(current)) throw errorCode(errorMessage);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw errorCode(errorMessage);
    }
  }
};

const ensureSafeDirectory = (root, components, errorMessage) => {
  assertSafeExistingDirectory(root, errorMessage);
  let current = path.resolve(root);
  for (const component of components) {
    if (
      typeof component !== 'string'
      || component.length === 0
      || component === '.'
      || component === '..'
      || component.includes('/')
      || component.includes('\\')
    ) {
      throw errorCode(errorMessage);
    }
    current = path.join(current, component);
    if (!existsSync(current)) {
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch {
        // A concurrent creator is safe only if the resulting path is safe.
      }
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw errorCode(errorMessage);
    }
  }
  return current;
};

const projectIdentity = (root) => {
  let config;
  try {
    config = parseToml(
      readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8'),
    );
  } catch {
    throw errorCode('SUPABASE_GATE_FAILED:runner');
  }
  const projectId = config?.project_id;
  if (
    typeof projectId !== 'string'
    || projectId.length === 0
    || projectId.length > 128
  ) {
    throw errorCode('SUPABASE_GATE_FAILED:runner');
  }
  const ports = [];
  const visit = (value, prefix = '') => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      const field = prefix.length === 0 ? key : `${prefix}.${key}`;
      if (
        (key === 'port' || key.endsWith('_port'))
        && Number.isSafeInteger(nested)
        && nested > 0
        && nested <= 65_535
      ) {
        ports.push({ path: field, value: nested });
      } else {
        visit(nested, field);
      }
    }
  };
  visit(config);
  ports.sort((left, right) => left.path.localeCompare(right.path));
  if (
    !ports.some((entry) => entry.path === 'api.port')
    || !ports.some((entry) => entry.path === 'db.port')
  ) {
    throw errorCode('SUPABASE_GATE_FAILED:runner');
  }
  return Object.freeze({
    projectId,
    ports: Object.freeze(ports.map((entry) => Object.freeze(entry))),
  });
};

const acquireLock = (temporaryRoot, identity) => {
  try {
    const directory = ensureSafeDirectory(
      temporaryRoot,
      [LOCK_BASE_DIRECTORY],
      'SUPABASE_GATE_FAILED:lock',
    );
    const identityHash = createHash('sha256')
      .update(JSON.stringify(identity))
      .digest('hex');
    const lockPath = path.join(directory, `${identityHash}.lock`);
    const descriptor = openSync(lockPath, 'wx', 0o600);
    return { descriptor, lockPath };
  } catch {
    throw errorCode('SUPABASE_GATE_FAILED:lock');
  }
};

const releaseLock = (lock) => {
  if (lock === undefined) return true;
  let cleaned = true;
  try {
    closeSync(lock.descriptor);
  } catch {
    cleaned = false;
  }
  try {
    rmSync(lock.lockPath, { force: true });
  } catch {
    cleaned = false;
  }
  return cleaned;
};

const retainLock = (lock) => {
  if (lock === undefined) return true;
  try {
    closeSync(lock.descriptor);
    return true;
  } catch {
    return false;
  }
};

const createObservationRun = (temporaryRoot, gateRunId) => {
  try {
    const base = ensureSafeDirectory(
      temporaryRoot,
      [OBSERVATION_BASE_DIRECTORY],
      'SUPABASE_GATE_FAILED:runner',
    );
    const directory = path.join(base, gateRunId);
    mkdirSync(directory, { mode: 0o700 });
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error('unsafe observation directory');
    }
    return {
      directory,
      observationPath: path.join(directory, 'observation.json'),
    };
  } catch {
    throw errorCode('SUPABASE_GATE_FAILED:runner');
  }
};

const cleanupObservationRun = (run) => {
  if (run === undefined) return true;
  let cleaned = true;
  try {
    rmSync(run.observationPath, { force: true });
  } catch {
    cleaned = false;
  }
  try {
    rmdirSync(run.directory);
  } catch {
    cleaned = false;
  }
  return cleaned;
};

const receiptLocation = (root, createDirectories) => {
  let current = path.resolve(root);
  assertSafeExistingDirectory(current, 'SUPABASE_GATE_FAILED:receipt');
  for (
    const component of RECEIPT_RELATIVE_PATH
      .split('/')
      .slice(0, -1)
  ) {
    current = path.join(current, component);
    if (!existsSync(current)) {
      if (!createDirectories) return undefined;
      mkdirSync(current, { mode: 0o700 });
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw errorCode('SUPABASE_GATE_FAILED:receipt');
    }
  }
  return path.join(current, 'receipt.json');
};

const invalidateReceipt = (root) => {
  try {
    const target = receiptLocation(root, false);
    if (target === undefined || !existsSync(target)) return true;
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) return false;
    rmSync(target, { force: true });
    return !existsSync(target);
  } catch {
    return false;
  }
};

const tryAcquirePublicationLock = (root) => {
  let lockPath;
  try {
    const receiptPath = receiptLocation(root, true);
    lockPath = path.join(
      path.dirname(receiptPath),
      PUBLICATION_LOCK_FILE_NAME,
    );
    const descriptor = openSync(lockPath, 'wx', 0o600);
    return { descriptor, lockPath };
  } catch (error) {
    if (
      error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'EEXIST'
      && lockPath !== undefined
    ) {
      try {
        const stat = lstatSync(lockPath);
        if (!stat.isSymbolicLink() && stat.isFile()) return undefined;
      } catch (inspectionError) {
        if (
          inspectionError
          && typeof inspectionError === 'object'
          && 'code' in inspectionError
          && inspectionError.code === 'ENOENT'
        ) {
          return undefined;
        }
      }
    }
    throw errorCode('SUPABASE_GATE_FAILED:lock');
  }
};

const waitForPublicationLockRetry = (setTimer, milliseconds) =>
  new Promise((resolve) => {
    setTimer(resolve, milliseconds);
  });

const acquirePublicationLock = async (
  root,
  {
    now = Date.now,
    setTimer = setTimeout,
    timeoutMs = PUBLICATION_LOCK_WAIT_TIMEOUT_MS,
  } = {},
) => {
  const deadline = now() + timeoutMs;
  while (true) {
    const lock = tryAcquirePublicationLock(root);
    if (lock !== undefined) return lock;
    if (now() >= deadline) {
      throw errorCode('SUPABASE_GATE_FAILED:lock');
    }
    await waitForPublicationLockRetry(
      setTimer,
      PUBLICATION_LOCK_RETRY_MS,
    );
  }
};

const releasePublicationLock = (lock) => {
  if (lock === undefined) return true;
  try {
    closeSync(lock.descriptor);
  } catch {
    return false;
  }
  try {
    rmSync(lock.lockPath);
    return true;
  } catch {
    return false;
  }
};

const writeComplete = (descriptor, text) => {
  const bytes = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < bytes.length) {
    const remaining = bytes.length - offset;
    const written = writeSync(
      descriptor,
      bytes,
      offset,
      remaining,
      null,
    );
    if (
      !Number.isSafeInteger(written)
      || written <= 0
      || written > remaining
    ) {
      throw new Error('incomplete receipt write');
    }
    offset += written;
  }
};

const publishReceipt = ({
  canonicalJson,
  commitSha,
  manifest,
  observation,
  root,
  validateObservation,
}) => {
  validateObservation(observation, observation.gateRunId);
  if (!commitShaPattern.test(commitSha)) {
    throw errorCode('SUPABASE_GATE_FAILED:receipt');
  }
  const target = receiptLocation(root, true);
  const payload = {
    schemaVersion: 1,
    requirementId: 'DATA-027',
    scope: 'LOCAL_DETERMINISTIC_NOT_PRODUCTION',
    commitSha,
    evidenceInputs: manifest.evidenceInputs,
    evidenceInputsSha256: manifest.evidenceInputsSha256,
    runtimeVersions: manifest.runtimeVersions,
    sessionsAttempted: 20,
    successfulSeats: 2,
    requiredRole: 'app_server',
    databaseOrigin: 'LOOPBACK_LOCAL_SUPABASE',
    testStatus: 'PASS',
  };
  const receipt = {
    ...payload,
    receiptSha256: `sha256:${createHash('sha256')
      .update(canonicalJson(payload), 'utf8')
      .digest('hex')}`,
  };
  const temporaryPath = path.join(
    path.dirname(target),
    `.data-027-receipt-${randomBytes(16).toString('hex')}.tmp`,
  );
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, 'wx', 0o600);
    writeComplete(descriptor, canonicalJson(receipt));
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, target);
  } catch {
    throw errorCode('SUPABASE_GATE_FAILED:receipt');
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // The fixed public error intentionally hides filesystem details.
      }
    }
    try {
      rmSync(temporaryPath, { force: true });
    } catch {
      // No post-publication operation can turn success into cleanup failure.
    }
  }
};

const readObservation = (
  observationPath,
  expectedGateRunId,
  validateObservation,
) => {
  if (!existsSync(observationPath)) {
    throw errorCode('DATA_027_OBSERVATION_MISSING');
  }
  let value;
  try {
    const stat = lstatSync(observationPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error('unsafe observation');
    }
    value = JSON.parse(readFileSync(observationPath, 'utf8'));
  } catch (error) {
    if (
      error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'ENOENT'
    ) {
      throw errorCode('DATA_027_OBSERVATION_MISSING');
    }
    throw errorCode('DATA_027_OBSERVATION_INVALID');
  }
  try {
    return validateObservation(value, expectedGateRunId);
  } catch {
    throw errorCode('DATA_027_OBSERVATION_INVALID');
  }
};

const stepStatus = (result) =>
  result?.status ?? result?.exitCode ?? result?.code ?? null;

const runStep = async (spawnStep, step) => {
  let result;
  try {
    result = await spawnStep(step);
  } catch {
    if (step.name === 'docker_preflight') {
      throw errorCode('SUPABASE_GATE_DOCKER_UNAVAILABLE');
    }
    throw errorCode(`SUPABASE_GATE_FAILED:${step.name}`);
  }
  if (result?.terminationConfirmed === false) {
    throw errorCode('SUPABASE_GATE_FAILED:termination');
  }
  if (
    step.name === 'docker_preflight'
    && (result?.timedOut || stepStatus(result) !== 0)
  ) {
    throw errorCode('SUPABASE_GATE_DOCKER_UNAVAILABLE');
  }
  if (result?.timedOut) {
    throw errorCode(`SUPABASE_GATE_TIMEOUT:${step.name}`);
  }
  if (stepStatus(result) !== 0) {
    throw errorCode(`SUPABASE_GATE_FAILED:${step.name}`);
  }
};

const loadEvidenceTools = async () => {
  const [evidence, canonical] = await Promise.all([
    tsImport('../data-027-runtime-evidence.ts', import.meta.url),
    tsImport(
      '../../packages/contracts/src/canonical-json.ts',
      import.meta.url,
    ),
  ]);
  return {
    buildData027EvidenceManifest: evidence.buildData027EvidenceManifest,
    canonicalJson: canonical.canonicalJson,
    validateData027Observation: evidence.validateData027Observation,
  };
};

const cloneAndFreeze = (value) => {
  const cloned = structuredClone(value);
  const freeze = (candidate) => {
    if (candidate === null || typeof candidate !== 'object') return candidate;
    for (const nested of Object.values(candidate)) freeze(nested);
    return Object.freeze(candidate);
  };
  return freeze(cloned);
};

const runSupabaseGateWithPublicationLock = async (
  overrides,
  root,
  invalidateCurrentReceipt,
) => {
  if (invalidateCurrentReceipt(root) !== true) {
    throw errorCode('SUPABASE_GATE_FAILED:receipt');
  }

  const randomUUID = overrides.randomUUID ?? systemRandomUUID;
  const temporaryRootProvider = overrides.tmpdir ?? systemTmpdir;
  const now = overrides.now ?? Date.now;
  const setTimer = overrides.setTimeout ?? setTimeout;
  const clearTimer = overrides.clearTimeout ?? clearTimeout;
  const platform = overrides.platform ?? process.platform;
  const spawnStep = overrides.spawnStep ?? createDefaultSpawnStep({
    clearTimeout: clearTimer,
    now,
    platform,
    setTimeout: setTimer,
  });
  const dockerExecutable = overrides.dockerExecutable ?? 'docker';
  const nodeExecutable = overrides.nodeExecutable ?? process.execPath;
  const environment = {
    ...sanitizeEnvironment(overrides.environment ?? process.env),
    NODE_ENV: 'test',
  };
  let gateRunId;
  let supabaseCommand;
  let temporaryRoot;
  let identity;
  try {
    gateRunId = randomUUID();
    temporaryRoot = path.resolve(temporaryRootProvider());
    identity = overrides.projectIdentity ?? projectIdentity(root);
    supabaseCommand = overrides.supabaseExecutable !== undefined
      ? { executable: overrides.supabaseExecutable, argsPrefix: [] }
      : platform === 'win32'
        ? {
            executable: nodeExecutable,
            argsPrefix: [
              (
                overrides.resolveSupabaseCliEntry
                ?? defaultResolveSupabaseCliEntry
              )(),
            ],
          }
        : { executable: 'supabase', argsPrefix: [] };
  } catch {
    throw errorCode('SUPABASE_GATE_FAILED:runner');
  }
  if (!gateRunIdPattern.test(gateRunId)) {
    throw errorCode('SUPABASE_GATE_FAILED:runner');
  }

  let evidenceTools;
  try {
    evidenceTools = overrides.evidenceTools ?? await loadEvidenceTools();
    if (
      typeof evidenceTools.buildData027EvidenceManifest !== 'function'
      || typeof evidenceTools.canonicalJson !== 'function'
      || typeof evidenceTools.validateData027Observation !== 'function'
    ) {
      throw new Error('invalid evidence tools');
    }
  } catch {
    throw errorCode('SUPABASE_GATE_FAILED:runner');
  }

  const buildManifest =
    overrides.buildData027EvidenceManifest
    ?? evidenceTools.buildData027EvidenceManifest;
  const validateObservation =
    overrides.validateData027Observation
    ?? evidenceTools.validateData027Observation;
  const publishCurrentReceipt =
    overrides.publishData027Receipt
    ?? ((input) => publishReceipt(input));
  const acquireGateLock =
    overrides.acquireGateLock
    ?? ((project) => acquireLock(temporaryRoot, project));
  const releaseGateLock = overrides.releaseGateLock ?? releaseLock;
  const retainGateLock = overrides.retainGateLock ?? retainLock;
  const createObservation = overrides.createObservationRun
    ?? ((runId) => createObservationRun(temporaryRoot, runId));
  const cleanupObservation =
    overrides.cleanupObservationRun
    ?? cleanupObservationRun;

  const steps = [
    [
      'runtime_preflight',
      nodeExecutable,
      ['tools/check-runtime.mjs'],
      10_000,
    ],
    ['docker_preflight', dockerExecutable, ['info'], 10_000],
    [
      'db_reset',
      supabaseCommand.executable,
      [...supabaseCommand.argsPrefix, 'db', 'reset', '--local'],
      600_000,
    ],
    [
      'db_lint',
      supabaseCommand.executable,
      [
        ...supabaseCommand.argsPrefix,
        'db',
        'lint',
        '--local',
        '--fail-on',
        'error',
      ],
      120_000,
    ],
    [
      'pg_tap',
      supabaseCommand.executable,
      [...supabaseCommand.argsPrefix, 'test', 'db', '--local'],
      300_000,
    ],
    [
      'auth_local',
      nodeExecutable,
      ['tools/run-pnpm.mjs', 'test:auth:local'],
      300_000,
    ],
    [
      'data_027_concurrency',
      nodeExecutable,
      ['tools/run-pnpm.mjs', 'test:db:concurrency'],
      300_000,
    ],
  ];

  let lock;
  let observationRun;
  let observation;
  let preRunManifest;
  let failure;
  let retainSharedLock = false;
  try {
    lock = acquireGateLock(identity);
    preRunManifest = cloneAndFreeze(buildManifest(root));
    observationRun = createObservation(gateRunId);
    for (const [name, executable, args, timeoutMs] of steps) {
      const env = name === 'data_027_concurrency'
        ? {
            ...environment,
            TOUCHCATCH_DATA027_GATE_RUN_ID: gateRunId,
          }
        : { ...environment };
      await runStep(spawnStep, {
        name,
        executable,
        args,
        timeoutMs,
        cwd: root,
        env,
      });
    }
    observation = readObservation(
      observationRun.observationPath,
      gateRunId,
      validateObservation,
    );
    const postRunManifest = buildManifest(root);
    if (
      evidenceTools.canonicalJson(preRunManifest)
      !== evidenceTools.canonicalJson(postRunManifest)
    ) {
      throw errorCode('SUPABASE_GATE_FAILED:evidence_changed');
    }
  } catch (error) {
    failure = sanitizeGateError(error);
    retainSharedLock =
      failure.message === 'SUPABASE_GATE_FAILED:termination';
  }

  let cleanupFailed = false;
  try {
    if (cleanupObservation(observationRun) !== true) cleanupFailed = true;
  } catch {
    cleanupFailed = true;
  }
  if (retainSharedLock) {
    try {
      if (retainGateLock(lock) !== true) cleanupFailed = true;
    } catch {
      cleanupFailed = true;
    }
  } else {
    try {
      if (releaseGateLock(lock) !== true) cleanupFailed = true;
    } catch {
      cleanupFailed = true;
    }
  }

  if (failure !== undefined) throw failure;
  if (cleanupFailed) throw errorCode('SUPABASE_GATE_FAILED:cleanup');

  let commitSha;
  try {
    const finalManifest = buildManifest(root);
    if (
      evidenceTools.canonicalJson(preRunManifest)
      !== evidenceTools.canonicalJson(finalManifest)
    ) {
      throw errorCode('SUPABASE_GATE_FAILED:evidence_changed');
    }
    commitSha = (overrides.getCommitSha ?? defaultGetCommitSha)(root);
    publishCurrentReceipt({
      canonicalJson: evidenceTools.canonicalJson,
      commitSha,
      manifest: preRunManifest,
      observation,
      root,
      validateObservation,
    });
  } catch (error) {
    const sanitized = sanitizeGateError(error);
    if (sanitized.message === 'SUPABASE_GATE_FAILED:evidence_changed') {
      throw sanitized;
    }
    throw errorCode('SUPABASE_GATE_FAILED:receipt');
  }
};

export async function runSupabaseGateCore(overrides = {}) {
  const startPath = path.resolve(overrides.root ?? process.cwd());
  let root;
  try {
    root = path.resolve(
      (overrides.resolveRepositoryRoot ?? defaultResolveRepositoryRoot)(
        startPath,
      ),
    );
  } catch {
    throw errorCode('SUPABASE_GATE_FAILED:runner');
  }
  const invalidateCurrentReceipt =
    overrides.invalidateData027Receipt
    ?? invalidateReceipt;
  const acquireWorktreePublicationLock =
    overrides.acquirePublicationLock
    ?? (() => acquirePublicationLock(root, {
      now: overrides.publicationLockNow ?? Date.now,
      setTimer: overrides.publicationLockSetTimeout ?? setTimeout,
      timeoutMs:
        overrides.publicationLockTimeoutMs
        ?? PUBLICATION_LOCK_WAIT_TIMEOUT_MS,
    }));
  const releaseWorktreePublicationLock =
    overrides.releasePublicationLock
    ?? releasePublicationLock;
  let publicationLock;
  try {
    publicationLock = await acquireWorktreePublicationLock(root);
  } catch {
    throw errorCode('SUPABASE_GATE_FAILED:lock');
  }

  let failure;
  try {
    await runSupabaseGateWithPublicationLock(
      overrides,
      root,
      invalidateCurrentReceipt,
    );
  } catch (error) {
    failure = sanitizeGateError(error);
  }

  if (failure !== undefined) {
    let receiptInvalidated = false;
    try {
      receiptInvalidated = invalidateCurrentReceipt(root) === true;
    } catch {
      receiptInvalidated = false;
    }
    try {
      releaseWorktreePublicationLock(publicationLock);
    } catch {
      // Preserve the primary fixed failure; the receipt is already invalid.
    }
    if (!receiptInvalidated) {
      throw errorCode('SUPABASE_GATE_FAILED:receipt');
    }
    throw failure;
  }

  let publicationLockReleased = false;
  try {
    publicationLockReleased =
      releaseWorktreePublicationLock(publicationLock) === true;
  } catch {
    publicationLockReleased = false;
  }
  if (!publicationLockReleased) {
    let receiptInvalidated = false;
    try {
      receiptInvalidated = invalidateCurrentReceipt(root) === true;
    } catch {
      receiptInvalidated = false;
    }
    if (!receiptInvalidated) {
      throw errorCode('SUPABASE_GATE_FAILED:receipt');
    }
    throw errorCode('SUPABASE_GATE_FAILED:cleanup');
  }
}
