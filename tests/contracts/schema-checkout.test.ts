import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('generated schema checkout bytes', () => {
  it('forces generated JSON schemas to LF in every checkout', () => {
    const output = execFileSync(
      'git',
      ['check-attr', 'text', 'eol', '--', 'schemas/game-content.public.schema.json'],
      { encoding: 'utf8' },
    );

    expect(output).toContain('text: set');
    expect(output).toContain('eol: lf');
  });
});
