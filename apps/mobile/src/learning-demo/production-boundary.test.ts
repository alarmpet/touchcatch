import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('places the private learning registry behind the compile-time DEV branch', async () => {
  const source = await readFile('apps/mobile/app/index.tsx', 'utf8');
  expect(source).not.toMatch(/^import .*learning-demo\/registry/m);
  const guard = source.indexOf('if (!__DEV__)');
  const registryLoad = source.indexOf("require('../src/learning-demo/registry.js')");
  expect(guard).toBeGreaterThan(-1);
  expect(registryLoad).toBeGreaterThan(guard);
});
