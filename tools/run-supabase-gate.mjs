import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { randomUUID as systemRandomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir as systemTmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const observationEnvironmentKeys = [
  'TOUCHCATCH_DATA027_GATE_RUN_ID',
  'TOUCHCATCH_DATA027_OBSERVATION_PATH',
];

const errorCode = (code) => new Error(code);

const defaultGetCommitSha = (root) =>
  execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  }).trim();

const defaultResolveRepositoryRoot = (startPath) =>
  path.resolve(execFileSync('git', ['-C', startPath, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  }).trim());

const defaultResolveSupabaseCliEntry = () => {
  const packageJsonPath = fileURLToPath(import.meta.resolve('supabase/package.json'));
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

const terminateProcessTree = (child, platform) => {
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) return;
  if (platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // The caller reports only the fixed timeout taxonomy.
    }
  }
};

export const createDefaultSpawnStep = ({
  clearTimeout: clearTimer,
  now,
  platform,
  setTimeout: setTimer,
  spawnProcess = spawn,
  terminateProcessTree: terminateTree = terminateProcessTree,
}) => (step) => new Promise((resolve) => {
  const startedAtMs = now();
  let finished = false;
  let timer;
  const child = spawnProcess(step.executable, [...step.args], {
    cwd: step.cwd,
    detached: platform !== 'win32',
    env: step.env,
    shell: false,
    stdio: 'ignore',
    windowsHide: true,
  });
  const finish = (result) => {
    if (finished) return;
    finished = true;
    if (timer !== undefined) clearTimer(timer);
    resolve({ ...result, startedAtMs, endedAtMs: now() });
  };
  timer = setTimer(() => {
    try {
      terminateTree(child, platform);
    } finally {
      finish({ status: null, timedOut: true });
    }
  }, step.timeoutMs);
  if (finished) clearTimer(timer);
  child.once('error', () => finish({ status: null, timedOut: false }));
  child.once('close', (status) => finish({ status, timedOut: false }));
});

const ensureDirectoryWithoutSymlinks = (root, components) => {
  let current = path.resolve(root);
  for (const component of components) {
    current = path.join(current, component);
    if (!existsSync(current)) {
      try {
        mkdirSync(current);
      } catch {
        // A concurrent creator is acceptable only if the resulting path is safe.
      }
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw errorCode('SUPABASE_GATE_FAILED:lock');
  }
  return current;
};

const acquireLock = (root) => {
  try {
    const directory = ensureDirectoryWithoutSymlinks(
      root,
      ['.superpowers', 'evidence', 'data-027'],
    );
    const lockPath = path.join(directory, 'gate.lock');
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

const readObservation = (observationPath, expectedGateRunId, validateObservation) => {
  if (!existsSync(observationPath)) throw errorCode('DATA_027_OBSERVATION_MISSING');
  let value;
  try {
    value = JSON.parse(readFileSync(observationPath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
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

const stepStatus = (result) => result?.status ?? result?.exitCode ?? result?.code ?? null;

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
  if (step.name === 'docker_preflight' && (result?.timedOut || stepStatus(result) !== 0)) {
    throw errorCode('SUPABASE_GATE_DOCKER_UNAVAILABLE');
  }
  if (result?.timedOut) throw errorCode(`SUPABASE_GATE_TIMEOUT:${step.name}`);
  if (stepStatus(result) !== 0) throw errorCode(`SUPABASE_GATE_FAILED:${step.name}`);
};

const sanitizeGateError = (error) =>
  error instanceof Error
  && /^(?:SUPABASE_GATE_(?:DOCKER_UNAVAILABLE|TIMEOUT:[a-z0-9_]+|FAILED:[a-z0-9_]+)|DATA_027_OBSERVATION_(?:MISSING|INVALID))$/u.test(error.message)
    ? error
    : errorCode('SUPABASE_GATE_FAILED:runner');

const loadEvidenceTools = async () =>
  tsImport('./data-027-runtime-evidence.ts', import.meta.url);

export async function runSupabaseGate(overrides = {}) {
  const startPath = path.resolve(overrides.root ?? process.cwd());
  let root;
  try {
    root = path.resolve(
      (overrides.resolveRepositoryRoot ?? defaultResolveRepositoryRoot)(startPath),
    );
  } catch {
    throw errorCode('SUPABASE_GATE_FAILED:runner');
  }
  const randomUUID = overrides.randomUUID ?? systemRandomUUID;
  const tmpdir = overrides.tmpdir ?? systemTmpdir;
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
  let gateRunId;
  let supabaseCommand;
  try {
    gateRunId = randomUUID();
    supabaseCommand = overrides.supabaseExecutable !== undefined
      ? { executable: overrides.supabaseExecutable, argsPrefix: [] }
      : platform === 'win32'
        ? {
            executable: nodeExecutable,
            argsPrefix: [
              (overrides.resolveSupabaseCliEntry ?? defaultResolveSupabaseCliEntry)(),
            ],
          }
        : { executable: 'supabase', argsPrefix: [] };
  } catch {
    throw errorCode('SUPABASE_GATE_FAILED:runner');
  }
  if (
    typeof gateRunId !== 'string'
    || gateRunId.length === 0
    || gateRunId.includes('/')
    || gateRunId.includes('\\')
    || gateRunId === '.'
    || gateRunId === '..'
  ) {
    throw errorCode('SUPABASE_GATE_FAILED:runner');
  }

  const observationDirectory = path.join(tmpdir(), 'touchcatch-data-027');
  const observationPath = path.join(observationDirectory, `${gateRunId}.json`);
  const baseEnvironment = { ...process.env };
  for (const key of observationEnvironmentKeys) delete baseEnvironment[key];
  const steps = [
    ['docker_preflight', dockerExecutable, ['info'], 10_000],
    ['db_reset', supabaseCommand.executable, [...supabaseCommand.argsPrefix, 'db', 'reset', '--local'], 600_000],
    ['db_lint', supabaseCommand.executable, [...supabaseCommand.argsPrefix, 'db', 'lint', '--local', '--fail-on', 'error'], 120_000],
    ['pg_tap', supabaseCommand.executable, [...supabaseCommand.argsPrefix, 'test', 'db', '--local'], 300_000],
    ['auth_local', nodeExecutable, ['tools/run-pnpm.mjs', 'test:auth:local'], 300_000],
    ['data_027_concurrency', nodeExecutable, ['tools/run-pnpm.mjs', 'test:db:concurrency'], 300_000],
  ];
  const removeObservationFile = overrides.removeObservationFile
    ?? ((target, options) => rmSync(target, options));
  const releaseGateLock = overrides.releaseGateLock ?? releaseLock;

  let lock;
  let failure;
  let cleanupFailed = false;
  try {
    lock = acquireLock(root);
    mkdirSync(observationDirectory, { recursive: true });
    for (const [name, executable, args, timeoutMs] of steps) {
      if (name === 'data_027_concurrency') {
        removeObservationFile(observationPath, { force: true });
      }
      const env = name === 'data_027_concurrency'
        ? {
            ...baseEnvironment,
            TOUCHCATCH_DATA027_GATE_RUN_ID: gateRunId,
            TOUCHCATCH_DATA027_OBSERVATION_PATH: observationPath,
          }
        : { ...baseEnvironment };
      await runStep(spawnStep, {
        name,
        executable,
        args,
        timeoutMs,
        cwd: root,
        env,
      });
    }

    const evidenceTools = overrides.validateData027Observation !== undefined
      && overrides.writeData027Receipt !== undefined
      ? undefined
      : await loadEvidenceTools();
    const validateObservation =
      overrides.validateData027Observation ?? evidenceTools.validateData027Observation;
    const writeReceipt = overrides.writeData027Receipt ?? evidenceTools.writeData027Receipt;
    const observation = readObservation(observationPath, gateRunId, validateObservation);
    let commitSha;
    try {
      commitSha = (overrides.getCommitSha ?? defaultGetCommitSha)(root);
      writeReceipt(root, observation, commitSha);
    } catch {
      throw errorCode('SUPABASE_GATE_FAILED:receipt');
    }
  } catch (error) {
    failure = sanitizeGateError(error);
  } finally {
    let cleaned = true;
    try {
      removeObservationFile(observationPath, { force: true });
    } catch {
      cleaned = false;
    }
    try {
      if (releaseGateLock(lock) !== true) cleaned = false;
    } catch {
      cleaned = false;
    }
    cleanupFailed = !cleaned;
  }
  if (failure !== undefined) throw failure;
  if (cleanupFailed) throw errorCode('SUPABASE_GATE_FAILED:cleanup');
}

const isMain = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runSupabaseGate().catch((error) => {
    const message = error instanceof Error
      && /^(?:SUPABASE_GATE_(?:DOCKER_UNAVAILABLE|TIMEOUT:[a-z0-9_]+|FAILED:[a-z0-9_]+)|DATA_027_OBSERVATION_(?:MISSING|INVALID))$/u.test(error.message)
      ? error.message
      : 'SUPABASE_GATE_FAILED:runner';
    console.error(message);
    process.exitCode = 1;
  });
}
