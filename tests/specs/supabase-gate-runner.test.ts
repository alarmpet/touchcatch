import { execFileSync, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { closeSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir as systemTmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../packages/contracts/src/canonical-json.js';
import {
  buildData027EvidenceManifest,
  validateData027Observation,
  validateData027Receipt,
  type Data027Observation,
} from '../../tools/data-027-runtime-evidence.js';
import { executeRequirementOracle } from '../../tools/requirement-oracle.js';
import {
  createData027TestRepository,
  writeData027ReceiptFixture,
} from '../support/data-027-receipt-fixture.js';
// @ts-expect-error The internal gate core is intentionally plain ESM.
import { createDefaultSpawnStep, runSupabaseGateCore, terminateProcessTree } from '../../tools/internal/run-supabase-gate-core.mjs';

const runSupabaseGate = runSupabaseGateCore;

type GateStep = Readonly<{
  name: string;
  executable: string;
  args: readonly string[];
  timeoutMs: number;
  cwd: string;
  env: NodeJS.ProcessEnv;
}>;

type StepResult = Readonly<{
  status: number | null;
  timedOut: boolean;
  terminationConfirmed?: boolean;
}>;

const roots: string[] = [];
const commitSha = 'a'.repeat(40);
const runA = '00000000-0000-4000-8000-000000000001';
const runB = '00000000-0000-4000-8000-000000000002';
const evidenceManifest = Object.freeze({
  evidenceInputs: Object.freeze([
    Object.freeze({
      path: 'package.json',
      sha256: `sha256:${'a'.repeat(64)}`,
    }),
  ]),
  evidenceInputsSha256: `sha256:${'b'.repeat(64)}`,
  runtimeVersions: Object.freeze({
    node: 'v24.18.0',
    pnpm: '11.13.0',
  }),
});
const sharedProjectIdentity = Object.freeze({
  projectId: 'touchcatch',
  ports: Object.freeze([
    Object.freeze({ path: 'api.port', value: 55321 }),
    Object.freeze({ path: 'db.port', value: 55322 }),
  ]),
});

const validObservation = (gateRunId: string): Data027Observation => ({
  schemaVersion: 1,
  gateRunId,
  requirementId: 'DATA-027',
  sessionsAttempted: 20,
  successfulSeats: 2,
  requiredRole: 'app_server',
  databaseOrigin: 'LOOPBACK_LOCAL_SUPABASE',
  testStatus: 'PASS',
});

const createRoot = (): string => {
  const root = mkdtempSync(join(systemTmpdir(), 'supabase-gate-runner-'));
  roots.push(root);
  return root;
};

const writeProjectConfig = (
  root: string,
  projectId = 'touchcatch',
  apiPort = 55_321,
  databasePort = 55_322,
): void => {
  const target = join(root, 'supabase', 'config.toml');
  mkdirSync(join(root, 'supabase'), { recursive: true });
  writeFileSync(
    target,
    [
      `project_id = "${projectId}"`,
      '',
      '[api]',
      `port = ${apiPort}`,
      '',
      '[db]',
      `port = ${databasePort}`,
      'shadow_port = 55320',
    ].join('\n'),
  );
};

const observationPath = (temporaryRoot: string, gateRunId: string): string =>
  join(
    temporaryRoot,
    'touchcatch-data-027',
    gateRunId,
    'observation.json',
  );

const writeObservation = (temporaryRoot: string, gateRunId: string, value: unknown): void => {
  const target = observationPath(temporaryRoot, gateRunId);
  mkdirSync(join(temporaryRoot, 'touchcatch-data-027', gateRunId), { recursive: true });
  writeFileSync(target, JSON.stringify(value));
};

const waitForPath = async (target: string, timeoutMs = 5_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(target)) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for path');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const createHarness = (input: {
  root?: string;
  temporaryRoot?: string;
  gateRunId?: string;
  resultForStep?: (step: GateStep) => StepResult | Promise<StepResult>;
  observationForStep?: (step: GateStep) => unknown | undefined;
  startPath?: string;
  useDefaultRepositoryRoot?: boolean;
  writeReceipt?: ReturnType<typeof vi.fn>;
} = {}) => {
  const root = input.root ?? createRoot();
  const temporaryRoot = input.temporaryRoot ?? createRoot();
  const gateRunId = input.gateRunId ?? runA;
  const steps: GateStep[] = [];
  const writeReceipt = input.writeReceipt ?? vi.fn();
  const invalidateReceipt = vi.fn(() => true);
  const buildEvidenceManifest = vi.fn(() => evidenceManifest);
  const getCommitSha = vi.fn(() => commitSha);
  const spawnStep = vi.fn(async (step: GateStep): Promise<StepResult> => {
    steps.push(step);
    const result = await input.resultForStep?.(step) ?? { status: 0, timedOut: false };
    if (step.name === 'data_027_concurrency') {
      const observation = input.observationForStep?.(step);
      if (observation !== undefined) writeObservation(temporaryRoot, gateRunId, observation);
    }
    return result;
  });
  const deps = {
    root: input.startPath ?? root,
    spawnStep,
    randomUUID: () => gateRunId,
    tmpdir: () => temporaryRoot,
    now: () => 1_000,
    setTimeout,
    clearTimeout,
    dockerExecutable: 'docker-test',
    supabaseExecutable: 'supabase-test',
    nodeExecutable: 'node-test',
    validateData027Observation,
    buildData027EvidenceManifest: buildEvidenceManifest,
    publishData027Receipt: writeReceipt,
    invalidateData027Receipt: invalidateReceipt,
    evidenceTools: {
      buildData027EvidenceManifest: buildEvidenceManifest,
      canonicalJson,
      validateData027Observation,
    },
    projectIdentity: sharedProjectIdentity,
    getCommitSha,
    ...(input.useDefaultRepositoryRoot ? {} : { resolveRepositoryRoot: () => root }),
  };
  return {
    buildEvidenceManifest,
    deps,
    gateRunId,
    getCommitSha,
    invalidateReceipt,
    root,
    spawnStep,
    steps,
    temporaryRoot,
    writeReceipt,
  };
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bounded Supabase gate', () => {
  it('keeps dependency injection out of the production CLI module surface', async () => {
    // @ts-expect-error The production entry is intentionally plain ESM.
    const productionEntry = await import('../../tools/run-supabase-gate.mjs');

    expect(Object.keys(productionEntry)).toEqual([]);
  });

  it('terminates a Windows child tree through taskkill without a command shell', () => {
    const spawnSyncProcess = vi.fn(() => ({
      error: undefined,
      signal: null,
      status: 0,
    }));
    const child = { pid: 2468, kill: vi.fn() };

    terminateProcessTree(child, 'win32', { spawnSyncProcess });

    expect(spawnSyncProcess).toHaveBeenCalledWith(
      'taskkill',
      ['/PID', '2468', '/T', '/F'],
      {
        shell: false,
        stdio: 'ignore',
        timeout: 10_000,
        windowsHide: true,
      },
    );
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('rejects a nonzero or timed-out Windows taskkill result', () => {
    const child = { pid: 2468, kill: vi.fn() };

    expect(terminateProcessTree(child, 'win32', {
      spawnSyncProcess: vi.fn(() => ({
        error: undefined,
        signal: null,
        status: 1,
      })),
    })).toBe(false);
    expect(terminateProcessTree(child, 'win32', {
      spawnSyncProcess: vi.fn(() => ({
        error: new Error('timed out'),
        signal: 'SIGTERM',
        status: null,
      })),
    })).toBe(false);
  });

  it('terminates a non-Windows detached child through its negative process group', () => {
    const killProcess = vi.fn();
    const child = { pid: 1357, kill: vi.fn() };

    terminateProcessTree(child, 'linux', { killProcess });

    expect(killProcess).toHaveBeenCalledWith(-1357, 'SIGKILL');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('spawns an absolute Windows Node path with spaces without a command shell', async () => {
    const child = Object.assign(new EventEmitter(), { pid: 1234, kill: vi.fn() });
    const spawnProcess = vi.fn(() => {
      queueMicrotask(() => child.emit('close', 0));
      return child;
    });
    const spawnStep = createDefaultSpawnStep({
      clearTimeout,
      now: () => 1_000,
      platform: 'win32',
      setTimeout,
      spawnProcess,
    });

    await expect(spawnStep({
      name: 'auth_local',
      executable: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['tools/run-pnpm.mjs', 'test:auth:local'],
      timeoutMs: 1_000,
      cwd: 'C:\\repo with spaces',
      env: {},
    })).resolves.toMatchObject({ status: 0, timedOut: false });

    expect(spawnProcess).toHaveBeenCalledWith(
      'C:\\Program Files\\nodejs\\node.exe',
      ['tools/run-pnpm.mjs', 'test:auth:local'],
      expect.objectContaining({ shell: false }),
    );
  });

  it('terminates the complete child tree when the production step timeout fires', async () => {
    const child = Object.assign(new EventEmitter(), { pid: 4321, kill: vi.fn() });
    const spawnProcess = vi.fn(() => child);
    const killProcess = vi.fn();
    let timeoutCallback!: () => void;
    const clearTimer = vi.fn();
    const spawnStep = createDefaultSpawnStep({
      clearTimeout: clearTimer,
      now: vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(2_000),
      platform: 'linux',
      setTimeout: (callback: () => void) => {
        timeoutCallback = callback;
        return 99;
      },
      spawnProcess,
      killProcess,
    });

    const result = spawnStep({
      name: 'db_reset',
      executable: '/usr/bin/supabase',
      args: ['db', 'reset', '--local'],
      timeoutMs: 600_000,
      cwd: '/repo',
      env: {},
    });
    timeoutCallback();
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    child.emit('close', null);

    await expect(result).resolves.toMatchObject({
      status: null,
      timedOut: true,
      terminationConfirmed: true,
    });
    expect(killProcess).toHaveBeenCalledWith(-4321, 'SIGKILL');
    expect(clearTimer).toHaveBeenCalledWith(99);
  });

  it('reports unconfirmed termination after taskkill fails even when the child closes', async () => {
    const child = Object.assign(new EventEmitter(), {
      pid: 4321,
      kill: vi.fn(),
    });
    let timeoutCallback!: () => void;
    const spawnStep = createDefaultSpawnStep({
      clearTimeout: vi.fn(),
      now: () => 1_000,
      platform: 'win32',
      setTimeout: (callback: () => void) => {
        timeoutCallback = callback;
        return 99;
      },
      spawnProcess: vi.fn(() => child),
      spawnSyncProcess: vi.fn(() => ({
        error: undefined,
        signal: null,
        status: 1,
      })),
    });

    const result = spawnStep({
      name: 'db_reset',
      executable: 'supabase.exe',
      args: ['db', 'reset', '--local'],
      timeoutMs: 600_000,
      cwd: 'C:\\repo',
      env: {},
    });
    timeoutCallback();
    child.emit('close', null);

    await expect(result).resolves.toMatchObject({
      timedOut: true,
      terminationConfirmed: false,
    });
  });

  it('maps an unavailable Docker preflight and stops before later steps', async () => {
    const harness = createHarness({
      resultForStep: (step) => step.name === 'docker_preflight'
        ? { status: 1, timedOut: false }
        : { status: 0, timedOut: false },
    });

    await expect(runSupabaseGate(harness.deps)).rejects.toThrow('SUPABASE_GATE_DOCKER_UNAVAILABLE');

    expect(harness.steps.map((step) => step.name)).toEqual([
      'runtime_preflight',
      'docker_preflight',
    ]);
    expect(harness.writeReceipt).not.toHaveBeenCalled();
  });

  it('cannot reach Docker or publish when exact-runtime preflight fails', async () => {
    const harness = createHarness({
      resultForStep: (step) => step.name === 'runtime_preflight'
        ? { status: 1, timedOut: false }
        : { status: 0, timedOut: false },
    });

    await expect(runSupabaseGate(harness.deps)).rejects.toThrow(
      'SUPABASE_GATE_FAILED:runtime_preflight',
    );

    expect(harness.steps.map((step) => step.name)).toEqual([
      'runtime_preflight',
    ]);
    expect(harness.writeReceipt).not.toHaveBeenCalled();
  });

  it('maps a reset timeout and stops before later steps', async () => {
    const harness = createHarness({
      resultForStep: (step) => step.name === 'db_reset'
        ? { status: null, timedOut: true }
        : { status: 0, timedOut: false },
    });

    await expect(runSupabaseGate(harness.deps)).rejects.toThrow('SUPABASE_GATE_TIMEOUT:db_reset');

    expect(harness.steps.map((step) => step.name)).toEqual([
      'runtime_preflight',
      'docker_preflight',
      'db_reset',
    ]);
    expect(harness.writeReceipt).not.toHaveBeenCalled();
  });

  it('retains the shared lock when process-tree death cannot be confirmed', async () => {
    const harness = createHarness({
      resultForStep: (step) => step.name === 'db_reset'
        ? {
            status: null,
            timedOut: true,
            terminationConfirmed: false,
          }
        : { status: 0, timedOut: false },
    });
    const lock = { descriptor: 123, lockPath: 'retained.lock' };
    const acquireGateLock = vi.fn(() => lock);
    const releaseGateLock = vi.fn(() => true);
    const retainGateLock = vi.fn(() => true);

    await expect(runSupabaseGate({
      ...harness.deps,
      acquireGateLock,
      releaseGateLock,
      retainGateLock,
    })).rejects.toThrow('SUPABASE_GATE_FAILED:termination');

    expect(retainGateLock).toHaveBeenCalledWith(lock);
    expect(releaseGateLock).not.toHaveBeenCalled();
    expect(harness.writeReceipt).not.toHaveBeenCalled();
  });

  it('maps a pgTAP nonzero exit and stops before later steps', async () => {
    const harness = createHarness({
      resultForStep: (step) => step.name === 'pg_tap'
        ? { status: 1, timedOut: false }
        : { status: 0, timedOut: false },
    });

    await expect(runSupabaseGate(harness.deps)).rejects.toThrow('SUPABASE_GATE_FAILED:pg_tap');

    expect(harness.steps.map((step) => step.name)).toEqual([
      'runtime_preflight',
      'docker_preflight',
      'db_reset',
      'db_lint',
      'pg_tap',
    ]);
    expect(harness.writeReceipt).not.toHaveBeenCalled();
  });

  it('runs only the allow-listed bounded sequence and scopes observation env to concurrency', async () => {
    const harness = createHarness({
      observationForStep: () => validObservation(runA),
    });
    const hostileEnvironment = {
      PATH: 'safe-path',
      SUPABASE_WORKDIR: 'C:\\other-project',
      TEST_DATABASE_URL:
        'postgresql://postgres:postgres@127.0.0.1:59999/postgres',
      LOCAL_SUPABASE_API_URL: 'http://127.0.0.1:59998',
      local_mailpit_url: 'http://127.0.0.1:59997',
      CONTENT_ASSET_ORIGINS: 'https://hostile.example.test',
      NODE_ENV: 'production',
      TOUCHCATCH_DATA027_OBSERVATION_PATH: 'C:\\redirected.json',
    };

    await runSupabaseGate({
      ...harness.deps,
      environment: hostileEnvironment,
    });

    expect(harness.steps.map(({ name, executable, args, timeoutMs }) => [name, executable, args, timeoutMs])).toEqual([
      ['runtime_preflight', 'node-test', ['tools/check-runtime.mjs'], 10_000],
      ['docker_preflight', 'docker-test', ['info'], 10_000],
      ['db_reset', 'supabase-test', ['db', 'reset', '--local'], 600_000],
      ['db_lint', 'supabase-test', ['db', 'lint', '--local', '--fail-on', 'error'], 120_000],
      ['pg_tap', 'supabase-test', ['test', 'db', '--local'], 300_000],
      ['auth_local', 'node-test', ['tools/run-pnpm.mjs', 'test:auth:local'], 300_000],
      ['data_027_concurrency', 'node-test', ['tools/run-pnpm.mjs', 'test:db:concurrency'], 300_000],
    ]);
    for (const step of harness.steps.slice(0, -1)) {
      expect(step.env.TOUCHCATCH_DATA027_GATE_RUN_ID).toBeUndefined();
      expect(step.env.TOUCHCATCH_DATA027_OBSERVATION_PATH).toBeUndefined();
    }
    for (const step of harness.steps) {
      expect(
        Object.keys(step.env).map((key) => key.toLowerCase()),
      ).not.toEqual(expect.arrayContaining([
        'local_mailpit_url',
        'local_supabase_api_url',
        'content_asset_origins',
        'supabase_workdir',
        'test_database_url',
        'touchcatch_data027_observation_path',
      ]));
      expect(step.env.PATH).toBe('safe-path');
      expect(step.env.NODE_ENV).toBe('test');
    }
    expect(harness.steps.at(-1)?.env).toMatchObject({
      TOUCHCATCH_DATA027_GATE_RUN_ID: runA,
    });
    expect(harness.writeReceipt).toHaveBeenCalledOnce();
    expect(harness.writeReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        observation: validObservation(runA),
        commitSha,
        manifest: evidenceManifest,
        root: harness.root,
      }),
    );
    expect(existsSync(observationPath(harness.temporaryRoot, runA))).toBe(false);
  });

  it('rejects a repository mutation between the pre-run and post-run manifests', async () => {
    const changedManifest = {
      ...evidenceManifest,
      evidenceInputsSha256: `sha256:${'c'.repeat(64)}`,
    };
    const buildEvidenceManifest = vi.fn()
      .mockReturnValueOnce(evidenceManifest)
      .mockReturnValue(changedManifest);
    const harness = createHarness({
      observationForStep: () => validObservation(runA),
    });

    await expect(runSupabaseGate({
      ...harness.deps,
      buildData027EvidenceManifest: buildEvidenceManifest,
    })).rejects.toThrow('SUPABASE_GATE_FAILED:evidence_changed');

    expect(buildEvidenceManifest).toHaveBeenCalledTimes(2);
    expect(harness.writeReceipt).not.toHaveBeenCalled();
  });

  it('rechecks the frozen pre-run manifest after cleanup and before publication', async () => {
    const changedManifest = {
      ...evidenceManifest,
      evidenceInputsSha256: `sha256:${'d'.repeat(64)}`,
    };
    const buildEvidenceManifest = vi.fn()
      .mockReturnValueOnce(evidenceManifest)
      .mockReturnValueOnce(evidenceManifest)
      .mockReturnValueOnce(changedManifest);
    const harness = createHarness({
      observationForStep: () => validObservation(runA),
    });

    await expect(runSupabaseGate({
      ...harness.deps,
      buildData027EvidenceManifest: buildEvidenceManifest,
    })).rejects.toThrow('SUPABASE_GATE_FAILED:evidence_changed');

    expect(harness.writeReceipt).not.toHaveBeenCalled();
  });

  it('orders observation cleanup and lock release before receipt publication', async () => {
    const events: string[] = [];
    const harness = createHarness({
      observationForStep: () => validObservation(runA),
      writeReceipt: vi.fn(() => {
        events.push('publish');
      }),
    });
    const lock = { descriptor: 123, lockPath: 'test.lock' };

    await runSupabaseGate({
      ...harness.deps,
      acquireGateLock: () => lock,
      cleanupObservationRun: (run: { directory: string }) => {
        events.push('observation_cleanup');
        rmSync(run.directory, { recursive: true, force: true });
        return true;
      },
      releaseGateLock: () => {
        events.push('lock_release');
        return true;
      },
    });

    expect(events).toEqual([
      'observation_cleanup',
      'lock_release',
      'publish',
    ]);
  });

  it('uses a shell-free Node wrapper for the Windows Supabase CLI shim', async () => {
    const harness = createHarness({
      observationForStep: () => validObservation(runA),
    });
    const supabaseCliEntry = 'C:\\repo with spaces\\node_modules\\supabase\\dist\\supabase.js';
    const deps = {
      ...harness.deps,
      platform: 'win32',
      nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
      supabaseExecutable: undefined,
      resolveSupabaseCliEntry: () => supabaseCliEntry,
    };

    await runSupabaseGate(deps);

    for (const step of harness.steps.filter((candidate) =>
      ['db_reset', 'db_lint', 'pg_tap'].includes(candidate.name))) {
      expect(step.executable).toBe('C:\\Program Files\\nodejs\\node.exe');
      expect(step.args[0]).toBe(supabaseCliEntry);
    }
    expect(harness.steps.find((step) => step.name === 'docker_preflight')?.executable).toBe('docker-test');
  });

  it('rejects a pre-existing private run directory before spawning', async () => {
    const harness = createHarness();
    writeObservation(harness.temporaryRoot, harness.gateRunId, validObservation(runB));

    await expect(runSupabaseGate(harness.deps)).rejects.toThrow('SUPABASE_GATE_FAILED:runner');

    expect(harness.writeReceipt).not.toHaveBeenCalled();
    expect(harness.spawnStep).not.toHaveBeenCalled();
  });

  it.each([
    ['an old run id', validObservation(runB)],
    ['malformed JSON', '{not-json'],
    ['unexpected fields', { ...validObservation(runA), credential: 'must-not-pass' }],
  ])('rejects %s and cleans the observation', async (_label, observation) => {
    const harness = createHarness({
      observationForStep: () => observation,
    });
    if (typeof observation === 'string') {
      harness.spawnStep.mockImplementation(async (step: GateStep): Promise<StepResult> => {
        harness.steps.push(step);
        if (step.name === 'data_027_concurrency') {
          const target = observationPath(harness.temporaryRoot, harness.gateRunId);
          mkdirSync(join(harness.temporaryRoot, 'touchcatch-data-027'), { recursive: true });
          writeFileSync(target, observation);
        }
        return { status: 0, timedOut: false };
      });
    }

    await expect(runSupabaseGate(harness.deps)).rejects.toThrow('DATA_027_OBSERVATION_INVALID');

    expect(harness.writeReceipt).not.toHaveBeenCalled();
    expect(existsSync(observationPath(harness.temporaryRoot, harness.gateRunId))).toBe(false);
  });

  it.each([
    ['nonzero exit', { status: 1, timedOut: false }, 'SUPABASE_GATE_FAILED:data_027_concurrency'],
    ['timeout', { status: null, timedOut: true }, 'SUPABASE_GATE_TIMEOUT:data_027_concurrency'],
  ])('cleans the observation after a concurrency %s', async (_label, result, errorCode) => {
    const harness = createHarness({
      resultForStep: (step) => step.name === 'data_027_concurrency'
        ? result
        : { status: 0, timedOut: false },
      observationForStep: () => validObservation(runA),
    });

    await expect(runSupabaseGate(harness.deps)).rejects.toThrow(errorCode);

    expect(harness.writeReceipt).not.toHaveBeenCalled();
    expect(existsSync(observationPath(harness.temporaryRoot, harness.gateRunId))).toBe(false);
  });

  it('sanitizes a receipt writer exception and cleans the observation', async () => {
    const writeReceipt = vi.fn(() => {
      throw new Error('sensitive writer detail');
    });
    const harness = createHarness({
      observationForStep: () => validObservation(runA),
      writeReceipt,
    });

    await expect(runSupabaseGate(harness.deps)).rejects.toThrow('SUPABASE_GATE_FAILED:receipt');

    expect(existsSync(observationPath(harness.temporaryRoot, harness.gateRunId))).toBe(false);
  });

  it('fails closed when successful observation cleanup fails', async () => {
    const harness = createHarness({
      observationForStep: () => validObservation(runA),
    });
    const cleanupObservationRun = vi.fn((run: { directory: string }) => {
      rmSync(run.directory, { recursive: true, force: true });
      return false;
    });

    await expect(runSupabaseGate({
      ...harness.deps,
      cleanupObservationRun,
    })).rejects.toThrow('SUPABASE_GATE_FAILED:cleanup');

    expect(harness.writeReceipt).not.toHaveBeenCalled();
  });

  it('fails closed when successful lock cleanup fails', async () => {
    const harness = createHarness({
      observationForStep: () => validObservation(runA),
    });
    const releaseGateLock = vi.fn((lock: { descriptor: number; lockPath: string }) => {
      closeSync(lock.descriptor);
      rmSync(lock.lockPath, { force: true });
      return false;
    });

    await expect(runSupabaseGate({
      ...harness.deps,
      releaseGateLock,
    })).rejects.toThrow('SUPABASE_GATE_FAILED:cleanup');

    expect(harness.writeReceipt).not.toHaveBeenCalled();
  });

  it('leaves the real oracle BLOCKED when cleanup fails after invalidating an old PASS', async () => {
    const registry = JSON.parse(
      readFileSync('docs/requirements-registry.v1.json', 'utf8'),
    );
    const evidence = JSON.parse(
      readFileSync('config/requirement-evidence.v1.json', 'utf8'),
    );
    const row = registry.requirements.find(
      (candidate: { id: string }) => candidate.id === 'DATA-027',
    );
    const claim = evidence.entries.find(
      (candidate: { id: string }) => candidate.id === 'DATA-027',
    );
    const root = createData027TestRepository(process.cwd(), row.source);
    roots.push(root);
    writeData027ReceiptFixture(root);
    expect(executeRequirementOracle(root, row, claim).status).toBe('PASS');
    const harness = createHarness({
      root,
      observationForStep: () => validObservation(runA),
    });
    const {
      invalidateData027Receipt: _injectedInvalidator,
      ...depsWithRealInvalidation
    } = harness.deps;

    await expect(runSupabaseGate({
      ...depsWithRealInvalidation,
      cleanupObservationRun: (run: { directory: string }) => {
        rmSync(run.directory, { recursive: true, force: true });
        return false;
      },
    })).rejects.toThrow('SUPABASE_GATE_FAILED:cleanup');

    expect(harness.writeReceipt).not.toHaveBeenCalled();
    expect(executeRequirementOracle(root, row, claim)).toMatchObject({
      status: 'BLOCKED',
      reason: 'LOCAL_DB_EVIDENCE_UNAVAILABLE',
    });
  });

  it('publishes a validator-accepted receipt only after the production cleanup path', async () => {
    const root = createData027TestRepository(process.cwd());
    roots.push(root);
    const harness = createHarness({
      root,
      observationForStep: () => validObservation(runA),
    });
    const {
      buildData027EvidenceManifest: _injectedBuilder,
      evidenceTools: _injectedEvidenceTools,
      invalidateData027Receipt: _injectedInvalidator,
      publishData027Receipt: _injectedPublisher,
      ...productionReceiptDeps
    } = harness.deps;

    await runSupabaseGate(productionReceiptDeps);

    expect(validateData027Receipt(root)).toBe(true);
    expect(
      existsSync(observationPath(harness.temporaryRoot, runA)),
    ).toBe(false);
  });

  it('serializes two same-worktree owners through publication so a later failed run leaves the oracle BLOCKED', async () => {
    const registry = JSON.parse(
      readFileSync('docs/requirements-registry.v1.json', 'utf8'),
    );
    const evidence = JSON.parse(
      readFileSync('config/requirement-evidence.v1.json', 'utf8'),
    );
    const row = registry.requirements.find(
      (candidate: { id: string }) => candidate.id === 'DATA-027',
    );
    const claim = evidence.entries.find(
      (candidate: { id: string }) => candidate.id === 'DATA-027',
    );
    const root = createData027TestRepository(process.cwd(), row.source);
    const temporaryRoot = createRoot();
    roots.push(root);
    const first = createHarness({
      root,
      temporaryRoot,
      gateRunId: runA,
      observationForStep: () => validObservation(runA),
    });
    let secondSawInvalidatedReceipt = false;
    const second = createHarness({
      root,
      temporaryRoot,
      gateRunId: runB,
      resultForStep: (step) => {
        if (step.name === 'runtime_preflight') {
          secondSawInvalidatedReceipt = !existsSync(
            join(
              root,
              '.superpowers',
              'evidence',
              'data-027',
              'receipt.json',
            ),
          );
          return { status: 1, timedOut: false };
        }
        return { status: 0, timedOut: false };
      },
    });
    const productionDeps = (harness: ReturnType<typeof createHarness>) => {
      const {
        buildData027EvidenceManifest: _injectedBuilder,
        evidenceTools: _injectedEvidenceTools,
        getCommitSha: _injectedCommit,
        invalidateData027Receipt: _injectedInvalidator,
        publishData027Receipt: _injectedPublisher,
        ...deps
      } = harness.deps;
      return {
        ...deps,
        buildData027EvidenceManifest,
        evidenceTools: {
          buildData027EvidenceManifest,
          canonicalJson,
          validateData027Observation,
        },
        getCommitSha: () => commitSha,
      };
    };
    const secondDeps = productionDeps(second);
    let secondRun: Promise<void> | undefined;
    const firstDeps = {
      ...productionDeps(first),
      getCommitSha: () => {
        secondRun = runSupabaseGate(secondDeps);
        return commitSha;
      },
    };

    await runSupabaseGate(firstDeps);
    await expect(secondRun).rejects.toThrow(
      'SUPABASE_GATE_FAILED:runtime_preflight',
    );

    expect(secondSawInvalidatedReceipt).toBe(true);
    expect(executeRequirementOracle(root, row, claim)).toMatchObject({
      status: 'BLOCKED',
      reason: 'LOCAL_DB_EVIDENCE_UNAVAILABLE',
    });
  });

  it('invalidates a published receipt when worktree publication-lock cleanup fails', async () => {
    const registry = JSON.parse(
      readFileSync('docs/requirements-registry.v1.json', 'utf8'),
    );
    const evidence = JSON.parse(
      readFileSync('config/requirement-evidence.v1.json', 'utf8'),
    );
    const row = registry.requirements.find(
      (candidate: { id: string }) => candidate.id === 'DATA-027',
    );
    const claim = evidence.entries.find(
      (candidate: { id: string }) => candidate.id === 'DATA-027',
    );
    const root = createData027TestRepository(process.cwd(), row.source);
    roots.push(root);
    const harness = createHarness({
      root,
      observationForStep: () => validObservation(runA),
    });
    const {
      buildData027EvidenceManifest: _injectedBuilder,
      evidenceTools: _injectedEvidenceTools,
      invalidateData027Receipt: _injectedInvalidator,
      publishData027Receipt: _injectedPublisher,
      ...productionReceiptDeps
    } = harness.deps;
    const publicationLockPath = join(
      root,
      '.superpowers',
      'evidence',
      'data-027',
      'publication.lock',
    );

    try {
      await expect(runSupabaseGate({
        ...productionReceiptDeps,
        buildData027EvidenceManifest,
        evidenceTools: {
          buildData027EvidenceManifest,
          canonicalJson,
          validateData027Observation,
        },
        releasePublicationLock: (lock: { descriptor: number }) => {
          closeSync(lock.descriptor);
          return false;
        },
      })).rejects.toThrow('SUPABASE_GATE_FAILED:cleanup');

      expect(
        existsSync(join(
          root,
          '.superpowers',
          'evidence',
          'data-027',
          'receipt.json',
        )),
      ).toBe(false);
      expect(executeRequirementOracle(root, row, claim)).toMatchObject({
        status: 'BLOCKED',
        reason: 'LOCAL_DB_EVIDENCE_UNAVAILABLE',
      });
    } finally {
      rmSync(publicationLockPath, { force: true });
    }
  });

  it('retains the publication lock when receipt invalidation cannot be confirmed', async () => {
    const registry = JSON.parse(
      readFileSync('docs/requirements-registry.v1.json', 'utf8'),
    );
    const evidence = JSON.parse(
      readFileSync('config/requirement-evidence.v1.json', 'utf8'),
    );
    const row = registry.requirements.find(
      (candidate: { id: string }) => candidate.id === 'DATA-027',
    );
    const claim = evidence.entries.find(
      (candidate: { id: string }) => candidate.id === 'DATA-027',
    );
    const root = createData027TestRepository(process.cwd(), row.source);
    roots.push(root);
    writeData027ReceiptFixture(root);
    const harness = createHarness({ root });
    const publicationLockPath = join(
      root,
      '.superpowers',
      'evidence',
      'data-027',
      'publication.lock',
    );

    try {
      await expect(runSupabaseGate({
        ...harness.deps,
        invalidateData027Receipt: () => false,
      })).rejects.toThrow('SUPABASE_GATE_FAILED:receipt');

      expect(existsSync(publicationLockPath)).toBe(true);
      expect(executeRequirementOracle(root, row, claim)).toMatchObject({
        status: 'BLOCKED',
        reason: 'LOCAL_DB_EVIDENCE_UNAVAILABLE',
      });
    } finally {
      rmSync(publicationLockPath, { force: true });
    }
  });

  it('holds validator publication-lock ownership across manifest hashing before a gate can invalidate', async () => {
    const root = createData027TestRepository(process.cwd());
    const controls = createRoot();
    roots.push(root);
    writeData027ReceiptFixture(root);
    const readyPath = join(controls, 'validator-ready');
    const releasePath = join(controls, 'validator-release');
    const child = spawn(
      process.execPath,
      [
        join(
          process.cwd(),
          'tests',
          'fixtures',
          'data-027-paused-validator.mjs',
        ),
        root,
        readyPath,
        releasePath,
      ],
      {
        cwd: process.cwd(),
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });
    const childOutcome = new Promise<{
      signal: NodeJS.Signals | null;
      status: number | null;
    }>((resolve) => {
      child.once('close', (status, signal) => {
        resolve({ signal, status });
      });
    });

    try {
      await waitForPath(readyPath);
    } catch (error) {
      writeFileSync(releasePath, 'release');
      child.kill();
      await childOutcome;
      throw error;
    }

    const receipt = join(
      root,
      '.superpowers',
      'evidence',
      'data-027',
      'receipt.json',
    );
    const invalidateReceipt = vi.fn(() => {
      rmSync(receipt, { force: true });
      return !existsSync(receipt);
    });
    let reportGateWaiting: (() => void) | undefined;
    const gateWaitingForValidator = new Promise<void>((resolve) => {
      reportGateWaiting = resolve;
    });
    const harness = createHarness({
      root,
      resultForStep: (step) => step.name === 'runtime_preflight'
        ? { status: 1, timedOut: false }
        : { status: 0, timedOut: false },
    });
    const gateOutcome = runSupabaseGate({
      ...harness.deps,
      invalidateData027Receipt: invalidateReceipt,
      publicationLockSetTimeout: (
        callback: () => void,
        milliseconds: number,
      ) => {
        reportGateWaiting?.();
        return setTimeout(callback, milliseconds);
      },
    }).then(
      () => 'resolved',
      (error: unknown) =>
        error instanceof Error ? error.message : 'unknown',
    );

    let gateWaitTimeout: NodeJS.Timeout | undefined;
    let invalidatedBeforeValidatorFinished = false;
    let receiptPresentBeforeValidatorFinished = false;
    try {
      await Promise.race([
        gateWaitingForValidator,
        new Promise<never>((_resolve, reject) => {
          gateWaitTimeout = setTimeout(
            () => reject(new Error('gate did not observe validator lock')),
            5_000,
          );
        }),
      ]);
      invalidatedBeforeValidatorFinished =
        invalidateReceipt.mock.calls.length > 0;
      receiptPresentBeforeValidatorFinished = existsSync(receipt);
    } finally {
      if (gateWaitTimeout !== undefined) clearTimeout(gateWaitTimeout);
      writeFileSync(releasePath, 'release');
    }

    const validation = await childOutcome;
    const gateResult = await gateOutcome;

    expect(invalidatedBeforeValidatorFinished).toBe(false);
    expect(receiptPresentBeforeValidatorFinished).toBe(true);
    expect(validation).toEqual({ signal: null, status: 0 });
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({ result: true });
    expect(gateResult).toBe('SUPABASE_GATE_FAILED:runtime_preflight');
    expect(invalidateReceipt).toHaveBeenCalledTimes(2);
    expect(validateData027Receipt(root)).toBe(false);
  }, 30_000);

  it('serializes distinct worktrees that share one canonical Supabase project identity', async () => {
    const firstRoot = createRoot();
    const secondRoot = createRoot();
    writeProjectConfig(firstRoot);
    writeProjectConfig(secondRoot);
    const temporaryRoot = createRoot();
    let releaseDocker!: () => void;
    const dockerStarted = new Promise<void>((resolve) => {
      releaseDocker = resolve;
    });
    let markDockerStarted!: () => void;
    const waitForDocker = new Promise<void>((resolve) => {
      markDockerStarted = resolve;
    });
    const first = createHarness({
      root: firstRoot,
      temporaryRoot,
      gateRunId: runA,
      observationForStep: () => validObservation(runA),
      resultForStep: async (step) => {
        if (step.name === 'docker_preflight') {
          markDockerStarted();
          await dockerStarted;
        }
        return { status: 0, timedOut: false };
      },
    });
    const second = createHarness({
      root: secondRoot,
      temporaryRoot,
      gateRunId: runB,
      observationForStep: () => validObservation(runB),
    });
    const { projectIdentity: _firstIdentity, ...firstDeps } = first.deps;
    const { projectIdentity: _secondIdentity, ...secondDeps } = second.deps;

    const firstRun = runSupabaseGate(firstDeps);
    await waitForDocker;
    await expect(runSupabaseGate(secondDeps)).rejects.toThrow('SUPABASE_GATE_FAILED:lock');
    expect(second.spawnStep).not.toHaveBeenCalled();
    releaseDocker();
    await firstRun;

    expect(first.writeReceipt).toHaveBeenCalledOnce();
    expect(second.writeReceipt).not.toHaveBeenCalled();
  });

  it('does not collide independent Supabase project identities', async () => {
    const firstRoot = createRoot();
    const secondRoot = createRoot();
    writeProjectConfig(firstRoot, 'touchcatch-a', 55_321, 55_322);
    writeProjectConfig(secondRoot, 'touchcatch-b', 56_321, 56_322);
    const temporaryRoot = createRoot();
    let releaseDocker!: () => void;
    const holdDocker = new Promise<void>((resolve) => {
      releaseDocker = resolve;
    });
    let markDockerStarted!: () => void;
    const dockerStarted = new Promise<void>((resolve) => {
      markDockerStarted = resolve;
    });
    const first = createHarness({
      root: firstRoot,
      temporaryRoot,
      gateRunId: runA,
      observationForStep: () => validObservation(runA),
      resultForStep: async (step) => {
        if (step.name === 'docker_preflight') {
          markDockerStarted();
          await holdDocker;
        }
        return { status: 0, timedOut: false };
      },
    });
    const second = createHarness({
      root: secondRoot,
      temporaryRoot,
      gateRunId: runB,
      observationForStep: () => validObservation(runB),
    });
    const { projectIdentity: _firstIdentity, ...firstDeps } = first.deps;
    const { projectIdentity: _secondIdentity, ...secondDeps } = second.deps;

    const firstRun = runSupabaseGate(firstDeps);
    await dockerStarted;
    await expect(runSupabaseGate(secondDeps)).resolves.toBeUndefined();
    releaseDocker();
    await firstRun;

    expect(second.writeReceipt).toHaveBeenCalledOnce();
  });

  it('canonicalizes two invocation subdirectories to one worktree lock and cwd', async () => {
    const root = createRoot();
    execFileSync('git', ['init', '--quiet', root]);
    const firstDirectory = join(root, 'packages', 'first');
    const secondDirectory = join(root, 'packages', 'second');
    mkdirSync(firstDirectory, { recursive: true });
    mkdirSync(secondDirectory, { recursive: true });
    const temporaryRoot = createRoot();
    let releaseDocker!: () => void;
    const holdDocker = new Promise<void>((resolve) => {
      releaseDocker = resolve;
    });
    let markDockerStarted!: () => void;
    const dockerStarted = new Promise<void>((resolve) => {
      markDockerStarted = resolve;
    });
    const first = createHarness({
      root,
      startPath: firstDirectory,
      temporaryRoot,
      gateRunId: runA,
      observationForStep: () => validObservation(runA),
      useDefaultRepositoryRoot: true,
      resultForStep: async (step) => {
        if (step.name === 'docker_preflight') {
          markDockerStarted();
          await holdDocker;
        }
        return { status: 0, timedOut: false };
      },
    });
    const second = createHarness({
      root,
      startPath: secondDirectory,
      temporaryRoot,
      gateRunId: runB,
      observationForStep: () => validObservation(runB),
      useDefaultRepositoryRoot: true,
    });

    const firstRun = runSupabaseGate(first.deps);
    await dockerStarted;
    const secondRun = runSupabaseGate(second.deps);
    expect(second.steps).toEqual([]);
    expect(second.invalidateReceipt).not.toHaveBeenCalled();
    releaseDocker();
    await firstRun;
    await secondRun;

    expect(first.steps.every((step) => step.cwd === root)).toBe(true);
    expect(second.steps.every((step) => step.cwd === root)).toBe(true);
    expect(second.invalidateReceipt).toHaveBeenCalledOnce();
    expect(first.getCommitSha).toHaveBeenCalledWith(root);
    expect(second.getCommitSha).toHaveBeenCalledWith(root);
    expect(first.writeReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        root,
        observation: validObservation(runA),
        commitSha,
      }),
    );
    expect(second.writeReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        root,
        observation: validObservation(runB),
        commitSha,
      }),
    );
  });
});
