import { randomBytes } from 'node:crypto';
import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { canonicalJson } from '../../packages/contracts/src/canonical-json.js';
import { validateData027Observation } from '../../tools/data-027-runtime-evidence.js';

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);

export function maybeWriteData027Observation(input: {
  gateRunId?: string;
  observationPath?: string;
  sessionsAttempted: number;
  successfulSeats: number;
  verifiedRoles: readonly string[];
  databaseUrl: string;
}): void {
  const gateRunId = input.gateRunId ?? process.env.TOUCHCATCH_DATA027_GATE_RUN_ID;
  const observationPath = input.observationPath ?? process.env.TOUCHCATCH_DATA027_OBSERVATION_PATH;
  if (gateRunId === undefined && observationPath === undefined) return;
  if (typeof gateRunId !== 'string' || gateRunId.length === 0 || typeof observationPath !== 'string' || observationPath.length === 0) {
    throw new Error('DATA_027_OBSERVATION_INVALID');
  }

  try {
    if (!loopbackHosts.has(new URL(input.databaseUrl).hostname)) throw new Error('non-loopback database');
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
