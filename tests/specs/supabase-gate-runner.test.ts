import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir as systemTmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateData027Observation, type Data027Observation } from '../../tools/data-027-runtime-evidence.js';
// @ts-expect-error The production gate is intentionally plain ESM for direct Node execution.
import { runSupabaseGate } from '../../tools/run-supabase-gate.mjs';

type GateStep = Readonly<{
  name: string;
  executable: string;
  args: readonly string[];
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
}>;

type StepResult = Readonly<{
  status: number | null;
  timedOut: boolean;
}>;

const roots: string[] = [];
const commitSha = 'a'.repeat(40);

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

const observationPath = (temporaryRoot: string, gateRunId: string): string =>
  join(temporaryRoot, 'touchcatch-data-027', `${gateRunId}.json`);

const writeObservation = (temporaryRoot: string, gateRunId: string, value: unknown): void => {
  const target = observationPath(temporaryRoot, gateRunId);
  mkdirSync(join(temporaryRoot, 'touchcatch-data-027'), { recursive: true });
  writeFileSync(target, JSON.stringify(value));
};

const createHarness = (input: {
  root?: string;
  temporaryRoot?: string;
  gateRunId?: string;
  resultForStep?: (step: GateStep) => StepResult | Promise<StepResult>;
  observationForStep?: (step: GateStep) => unknown | undefined;
  writeReceipt?: ReturnType<typeof vi.fn>;
} = {}) => {
  const root = input.root ?? createRoot();
  const temporaryRoot = input.temporaryRoot ?? createRoot();
  const gateRunId = input.gateRunId ?? 'run-a';
  const steps: GateStep[] = [];
  const writeReceipt = input.writeReceipt ?? vi.fn();
  const spawnStep = vi.fn(async (step: GateStep): Promise<StepResult> => {
    steps.push(step);
    const result = await input.resultForStep?.(step) ?? { status: 0, timedOut: false };
    if (step.name === 'data_027_concurrency' && result.status === 0 && !result.timedOut) {
      const observation = input.observationForStep?.(step);
      if (observation !== undefined) writeObservation(temporaryRoot, gateRunId, observation);
    }
    return result;
  });
  const deps = {
    root,
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
    writeData027Receipt: writeReceipt,
    getCommitSha: () => commitSha,
  };
  return { deps, gateRunId, root, spawnStep, steps, temporaryRoot, writeReceipt };
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bounded Supabase gate', () => {
  it('maps an unavailable Docker preflight and stops before later steps', async () => {
    const harness = createHarness({
      resultForStep: (step) => step.name === 'docker_preflight'
        ? { status: 1, timedOut: false }
        : { status: 0, timedOut: false },
    });

    await expect(runSupabaseGate(harness.deps)).rejects.toThrow('SUPABASE_GATE_DOCKER_UNAVAILABLE');

    expect(harness.steps.map((step) => step.name)).toEqual(['docker_preflight']);
    expect(harness.writeReceipt).not.toHaveBeenCalled();
  });

  it('maps a reset timeout and stops before later steps', async () => {
    const harness = createHarness({
      resultForStep: (step) => step.name === 'db_reset'
        ? { status: null, timedOut: true }
        : { status: 0, timedOut: false },
    });

    await expect(runSupabaseGate(harness.deps)).rejects.toThrow('SUPABASE_GATE_TIMEOUT:db_reset');

    expect(harness.steps.map((step) => step.name)).toEqual(['docker_preflight', 'db_reset']);
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
      'docker_preflight',
      'db_reset',
      'db_lint',
      'pg_tap',
    ]);
    expect(harness.writeReceipt).not.toHaveBeenCalled();
  });

  it('runs only the allow-listed bounded sequence and scopes observation env to concurrency', async () => {
    const harness = createHarness({
      observationForStep: () => validObservation('run-a'),
    });

    await runSupabaseGate(harness.deps);

    expect(harness.steps.map(({ name, executable, args, timeoutMs }) => [name, executable, args, timeoutMs])).toEqual([
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
    expect(harness.steps.at(-1)?.env).toMatchObject({
      TOUCHCATCH_DATA027_GATE_RUN_ID: 'run-a',
      TOUCHCATCH_DATA027_OBSERVATION_PATH: observationPath(harness.temporaryRoot, 'run-a'),
    });
    expect(harness.writeReceipt).toHaveBeenCalledOnce();
    expect(harness.writeReceipt).toHaveBeenCalledWith(
      harness.root,
      validObservation('run-a'),
      commitSha,
    );
    expect(existsSync(observationPath(harness.temporaryRoot, 'run-a'))).toBe(false);
  });

  it('removes a stale run file before concurrency and rejects a missing observation', async () => {
    const harness = createHarness();
    writeObservation(harness.temporaryRoot, harness.gateRunId, validObservation('old-run'));

    await expect(runSupabaseGate(harness.deps)).rejects.toThrow('DATA_027_OBSERVATION_MISSING');

    expect(harness.writeReceipt).not.toHaveBeenCalled();
    expect(existsSync(observationPath(harness.temporaryRoot, harness.gateRunId))).toBe(false);
  });

  it.each([
    ['an old run id', validObservation('old-run')],
    ['malformed JSON', '{not-json'],
    ['unexpected fields', { ...validObservation('run-a'), credential: 'must-not-pass' }],
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
    });
    writeObservation(harness.temporaryRoot, harness.gateRunId, validObservation(harness.gateRunId));

    await expect(runSupabaseGate(harness.deps)).rejects.toThrow(errorCode);

    expect(harness.writeReceipt).not.toHaveBeenCalled();
    expect(existsSync(observationPath(harness.temporaryRoot, harness.gateRunId))).toBe(false);
  });

  it('sanitizes a receipt writer exception and cleans the observation', async () => {
    const writeReceipt = vi.fn(() => {
      throw new Error('sensitive writer detail');
    });
    const harness = createHarness({
      observationForStep: () => validObservation('run-a'),
      writeReceipt,
    });

    await expect(runSupabaseGate(harness.deps)).rejects.toThrow('SUPABASE_GATE_FAILED:receipt');

    expect(existsSync(observationPath(harness.temporaryRoot, harness.gateRunId))).toBe(false);
  });

  it('admits only one same-worktree gate and never steals its active lock', async () => {
    const root = createRoot();
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
      root,
      temporaryRoot,
      gateRunId: 'run-a',
      observationForStep: () => validObservation('run-a'),
      resultForStep: async (step) => {
        if (step.name === 'docker_preflight') {
          markDockerStarted();
          await dockerStarted;
        }
        return { status: 0, timedOut: false };
      },
    });
    const second = createHarness({
      root,
      temporaryRoot,
      gateRunId: 'run-b',
      observationForStep: () => validObservation('run-b'),
    });

    const firstRun = runSupabaseGate(first.deps);
    await waitForDocker;
    await expect(runSupabaseGate(second.deps)).rejects.toThrow('SUPABASE_GATE_FAILED:lock');
    expect(second.spawnStep).not.toHaveBeenCalled();
    releaseDocker();
    await firstRun;

    expect(first.writeReceipt).toHaveBeenCalledOnce();
    expect(second.writeReceipt).not.toHaveBeenCalled();
  });
});
