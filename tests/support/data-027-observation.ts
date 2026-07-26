import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, parse, resolve } from 'node:path';
import { canonicalJson } from '../../packages/contracts/src/canonical-json.js';
import { validateData027Observation } from '../../tools/data-027-runtime-evidence.js';

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);
const gateRunIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const repositoryRoot = resolve(import.meta.dirname, '../..');

const configuredDatabasePort = (): string => {
  const config = readFileSync(
    join(repositoryRoot, 'supabase', 'config.toml'),
    'utf8',
  );
  const sectionStart = config.search(/^\[db\]\s*$/mu);
  if (sectionStart < 0) throw new Error('invalid local database config');
  const afterHeader = config.slice(sectionStart).replace(/^[^\r\n]*(?:\r?\n)?/u, '');
  const nextSection = afterHeader.search(/^\[/mu);
  const section = nextSection < 0
    ? afterHeader
    : afterHeader.slice(0, nextSection);
  const port = /^\s*port\s*=\s*(\d+)\s*$/mu.exec(section ?? '')?.[1];
  if (port === undefined) throw new Error('invalid local database config');
  return port;
};

const assertSafeExistingDirectory = (target: string): void => {
  const absolute = resolve(target);
  const root = parse(absolute).root;
  let current = root;
  const relative = absolute.slice(root.length);
  for (const component of relative.split(/[\\/]/u).filter(Boolean)) {
    current = join(current, component);
    if (!existsSync(current)) throw new Error('missing observation directory');
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error('unsafe observation directory');
    }
  }
};

const observationTarget = (gateRunId: string): string => {
  const temporaryRoot = resolve(tmpdir());
  const directory = join(
    temporaryRoot,
    'touchcatch-data-027',
    gateRunId,
  );
  assertSafeExistingDirectory(directory);
  const target = join(directory, 'observation.json');
  if (existsSync(target)) {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error('unsafe observation target');
    }
    throw new Error('stale observation target');
  }
  return target;
};

export function maybeWriteData027Observation(input: {
  sessionsAttempted: number;
  successfulSeats: number;
  verifiedRoles: readonly string[];
  databaseUrl: string;
}): void {
  const gateRunId = process.env.TOUCHCATCH_DATA027_GATE_RUN_ID;
  if (gateRunId === undefined) return;
  if (!gateRunIdPattern.test(gateRunId)) {
    throw new Error('DATA_027_OBSERVATION_INVALID');
  }

  try {
    const observedUrl = new URL(input.databaseUrl);
    if (
      !loopbackHosts.has(observedUrl.hostname)
      || observedUrl.port !== configuredDatabasePort()
      || observedUrl.pathname !== '/postgres'
    ) {
      throw new Error('unverified local database');
    }
  } catch {
    throw new Error('DATA_027_OBSERVATION_INVALID');
  }
  if (input.verifiedRoles.length !== input.sessionsAttempted || !input.verifiedRoles.every((role) => role === 'app_server')) {
    throw new Error('DATA_027_OBSERVATION_INVALID');
  }

  const observation = validateData027Observation({
    schemaVersion: 1,
    gateRunId,
    requirementId: 'DATA-027',
    sessionsAttempted: input.sessionsAttempted,
    successfulSeats: input.successfulSeats,
    requiredRole: 'app_server',
    databaseOrigin: 'LOOPBACK_LOCAL_SUPABASE',
    testStatus: 'PASS',
  }, gateRunId);
  let observationPath: string;
  try {
    observationPath = observationTarget(gateRunId);
  } catch {
    throw new Error('DATA_027_OBSERVATION_INVALID');
  }
  const temporaryPath = join(dirname(observationPath), `.data-027-observation-${randomBytes(16).toString('hex')}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, 'wx', 0o600);
    const bytes = Buffer.from(canonicalJson(observation), 'utf8');
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (!Number.isSafeInteger(written) || written <= 0 || written > bytes.length - offset) throw new Error('incomplete write');
      offset += written;
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, observationPath);
  } catch {
    throw new Error('DATA_027_OBSERVATION_WRITE_FAILED');
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // The public error must not expose a filesystem path.
      }
    }
    try {
      rmSync(temporaryPath, { force: true });
    } catch {
      // A failed cleanup must not expose a filesystem path.
    }
  }
}
