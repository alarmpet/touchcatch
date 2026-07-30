import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('places the private learning registry behind the compile-time DEV branch', async () => {
  const source = await readFile('apps/mobile/app/index.tsx', 'utf8');
  expect(source).not.toMatch(/^import .*learning-demo\/registry/m);
  const guard = source.indexOf('if (!__DEV__)');
  const registryLoad = source.indexOf("require('../src/learning-demo/registry')");
  expect(guard).toBeGreaterThan(-1);
  expect(registryLoad).toBeGreaterThan(guard);
});

it('uses Metro-resolvable extensionless imports in runtime modules', async () => {
  const runtimeFiles = [
    'apps/mobile/app/index.tsx',
    'apps/mobile/src/learning-demo/LearningDemoScreen.tsx',
    'apps/mobile/src/learning-demo/data.ts',
    'apps/mobile/src/learning-demo/registry.ts',
  ];
  for (const file of runtimeFiles) {
    expect(await readFile(file, 'utf8'), file).not.toMatch(/(?:from|require\()['"][^'"]+\.js['"]/);
  }
});

it('replaces the private registry with an empty production projection at bundle time', async () => {
  const metro = await readFile('apps/mobile/metro.config.cjs', 'utf8');
  const stub = await readFile('apps/mobile/src/learning-demo/registry.production.ts', 'utf8');
  const rootPackage = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  const exporter = await readFile('tools/mobile/export-android.ts', 'utf8');
  expect(metro).toContain("process.env.NODE_ENV === 'production'");
  expect(metro).toContain('registry.production.ts');
  expect(stub).toContain('learningDemoEntries: readonly LearningDemoEntry[] = []');
  expect(stub).not.toContain('content/learning');
  expect(rootPackage.scripts['mobile:bundle:android']).toBe(
    'tsx tools/mobile/export-android.ts',
  );
  expect(exporter).toContain("NODE_ENV: 'production'");
  expect(exporter).toContain('PRIVATE_CONTENT_IN_PRODUCTION_BUNDLE');
});
