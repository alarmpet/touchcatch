import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function exportAndroid(root: string): void {
  const requireFromRoot = createRequire(resolve(root, 'package.json'));
  const expoCli = requireFromRoot.resolve('@expo/cli');
  const result = spawnSync(
    process.execPath,
    [
      expoCli,
      'export',
      '--platform',
      'android',
      '--output-dir',
      '../../.superpowers/mobile-export/android',
      '--clear',
    ],
    {
      cwd: resolve(root, 'apps/mobile'),
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ANDROID_EXPORT_EXIT:${result.status ?? 'SIGNAL'}`);
  const bundleDirectory = resolve(
    root,
    '.superpowers/mobile-export/android/_expo/static/js/android',
  );
  const bundle = readFileSync(resolve(bundleDirectory, readdirSync(bundleDirectory)[0]!));
  for (const sentinel of [
    'privateSolution',
    'difference_10',
    'content\\learning\\source\\en-resilience',
    'content/learning/source/en-resilience',
  ]) {
    if (bundle.includes(Buffer.from(sentinel))) {
      throw new Error(`PRIVATE_CONTENT_IN_PRODUCTION_BUNDLE:${sentinel}`);
    }
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  exportAndroid(process.cwd());
}
