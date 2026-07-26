import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSupabaseGateCore } from './internal/run-supabase-gate-core.mjs';

const fixedGateErrorPattern =
  /^(?:SUPABASE_GATE_(?:DOCKER_UNAVAILABLE|TIMEOUT:[a-z0-9_]+|FAILED:[a-z0-9_]+)|DATA_027_OBSERVATION_(?:MISSING|INVALID))$/u;

const isMain = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runSupabaseGateCore().catch((error) => {
    const message = error instanceof Error
      && fixedGateErrorPattern.test(error.message)
      ? error.message
      : 'SUPABASE_GATE_FAILED:runner';
    console.error(message);
    process.exitCode = 1;
  });
}
