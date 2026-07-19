import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('removes the private learning graph from the production root module', async () => {
  const source = await readFile('apps/mobile/app/index.tsx', 'utf8');
  expect(source).not.toMatch(/learning-demo|drafts|privateSolution|require\(/);
});

it('uses Metro-resolvable extensionless imports in runtime modules', async () => {
  for (const file of ['apps/mobile/app/index.tsx', 'apps/mobile/src/guest-content/registry.ts']) expect(await readFile(file, 'utf8'), file).not.toMatch(/(?:from|require\()['"][^'"]+\.js['"]/);
});

it('keeps production guest metadata independent from draft and private registries', async () => {
  const source = await readFile('apps/mobile/src/guest-content/registry.ts', 'utf8');
  expect(source).not.toMatch(/learning-demo|content\/learning\/drafts|privateSolution|correctOptionId|hitbox/i);
});

it('renders the public guest registry in production instead of throwing', async () => {
  const source = await readFile('apps/mobile/app/index.tsx', 'utf8');
  expect(source).toMatch(/publicGuestSamples/);
  expect(source).not.toMatch(/if \(!__DEV__\) throw/);
});

it('keeps unapproved draft assets and solution geometry out of the production guest screen', async () => {
  const source = await readFile('apps/mobile/src/guest-content/GuestLearningScreen.tsx', 'utf8');
  expect(source).not.toMatch(/content\/learning|privateSolution|hitbox|queue\.record|imagebutton/i);
  expect(source).toMatch(/권리 및 교육 검토 승인/);
});
