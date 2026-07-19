import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkContentSchemas, writeContentSchemas } from '../../tools/write-content-schemas.js';

const schemas = [
  'game-content.public.schema.json',
  'game-content.private.schema.json',
  'rights-manifest.schema.json',
] as const;

describe('generated schema checkout bytes', () => {
  it('emits all generated schemas with strict LF bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'touchcatch-schemas-'));
    await writeContentSchemas(root);

    expect(await checkContentSchemas(root)).toEqual([]);
    for (const schema of schemas) {
      const bytes = await readFile(join(root, 'schemas', schema), 'utf8');
      expect(bytes).not.toContain('\r\n');
      expect(bytes.endsWith('\n')).toBe(true);
    }
  });

  it.each(schemas)('strictly rejects CRLF drift in %s', async (schema) => {
    const root = await mkdtemp(join(tmpdir(), 'touchcatch-schemas-'));
    await writeContentSchemas(root);
    const path = join(root, 'schemas', schema);
    await writeFile(path, (await readFile(path, 'utf8')).replaceAll('\n', '\r\n'), 'utf8');

    expect(await checkContentSchemas(root)).toContain(`schemas/${schema}`);
  });
});
