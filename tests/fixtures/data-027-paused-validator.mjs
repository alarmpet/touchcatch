import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { tsImport } from 'tsx/esm/api';

const [root, readyPath, releasePath] = process.argv.slice(2);
if (!root || !readyPath || !releasePath) {
  throw new Error('data-027 paused validator requires root and control paths');
}

const pauseTarget = path.resolve(
  root,
  'packages',
  'content-validator',
  'src',
  'validate-content.ts',
);
const originalReadFileSync = fs.readFileSync;
let paused = false;

fs.readFileSync = function patchedReadFileSync(target, ...args) {
  if (!paused && path.resolve(String(target)) === pauseTarget) {
    paused = true;
    fs.writeFileSync(readyPath, 'ready', { flag: 'wx' });
    const waitState = new Int32Array(new SharedArrayBuffer(4));
    const deadline = Date.now() + 15_000;
    while (!fs.existsSync(releasePath)) {
      if (Date.now() >= deadline) {
        throw new Error('data-027 validator pause timed out');
      }
      Atomics.wait(waitState, 0, 0, 10);
    }
  }
  return Reflect.apply(originalReadFileSync, this, [target, ...args]);
};
syncBuiltinESMExports();

const evidence = await tsImport(
  '../../tools/data-027-runtime-evidence.ts',
  import.meta.url,
);
const result = evidence.validateData027Receipt(root);
process.stdout.write(JSON.stringify({ result }));
