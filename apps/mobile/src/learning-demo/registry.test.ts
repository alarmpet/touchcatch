import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('learning demo registry', () => {
  it('is the exact category and asset projection of the device allowlist', async () => {
    const manifest = JSON.parse(await readFile('content/learning/manifest.v1.json', 'utf8')) as { entries: Array<{ key: string; category: string }> };
    const allowlist = JSON.parse(await readFile('content/learning/device-demo.v1.json', 'utf8')) as { keys: string[] };
    const source = await readFile('apps/mobile/src/learning-demo/registry.ts', 'utf8');
    const bundleKeys = new Map([...source.matchAll(/const (\w+) = require\('\.\.\/\.\.\/\.\.\/\.\.\/content\/learning\/drafts\/([^']+)\.json'\)/g)].map((match) => [match[1]!, match[2]!]));
    const projected = [...source.matchAll(/buildDemoEntry\('([^']+)', (\w+), \{ imageA: require\('[^']+\/([^/']+)-a\.png'\), imageB: require\('[^']+\/([^/']+)-b\.png'\) \}, \{ width: \d+, height: \d+ \}\)/g)].map((match) => ({
      key: bundleKeys.get(match[2]!), category: match[1], imageAKey: match[3], imageBKey: match[4],
    }));
    const manifestByKey = new Map(manifest.entries.map((entry) => [entry.key, entry]));
    expect(projected).toEqual(allowlist.keys.map((key) => ({
      key,
      category: manifestByKey.get(key)?.category,
      imageAKey: key,
      imageBKey: key,
    })));
  });
});
