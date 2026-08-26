import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { hashDisposition, verifyDisposition } from './disposition-approval-verifier.js';

const approved = {
  approval: {
    status: 'APPROVED',
    approvedBy: 'operator',
    approvedAt: '2026-08-26T00:00:00Z',
    scope: 'closed-beta',
  },
  tables: [{ table: 'private.economy_subjects', disposition: 'DELETE' }],
};

describe('disposition approval', () => {
  it('allows a disposition a named person approved', () => {
    const verdict = verifyDisposition(JSON.stringify(approved));
    expect(verdict).toMatchObject({ allowed: true, deleteTableCount: 1 });
  });

  it('refuses while the status is still PROPOSED', () => {
    const verdict = verifyDisposition(
      JSON.stringify({ ...approved, approval: { ...approved.approval, status: 'PROPOSED' } }),
    );
    expect(verdict).toEqual({ allowed: false, reason: 'DISPOSITION_NOT_APPROVED:PROPOSED' });
  });

  it('refuses an approval with nobody attached to it', () => {
    // Flipping a string in a JSON file is not a decision. A name and a time are what make it one.
    for (const missing of ['approvedBy', 'approvedAt'] as const) {
      const verdict = verifyDisposition(
        JSON.stringify({ ...approved, approval: { ...approved.approval, [missing]: null } }),
      );
      expect(verdict, missing).toEqual({
        allowed: false,
        reason: 'DISPOSITION_APPROVAL_UNATTRIBUTED',
      });
    }
  });

  it('refuses an unknown disposition value rather than treating it as RETAIN', () => {
    const verdict = verifyDisposition(
      JSON.stringify({
        ...approved,
        tables: [{ table: 'private.thing', disposition: 'ANONYMISE' }],
      }),
    );
    expect(verdict).toEqual({ allowed: false, reason: 'DISPOSITION_UNKNOWN_VALUE:private.thing' });
  });

  it('refuses an empty or unparseable document', () => {
    expect(verifyDisposition('{')).toEqual({ allowed: false, reason: 'DISPOSITION_UNPARSEABLE' });
    expect(verifyDisposition(JSON.stringify({ ...approved, tables: [] }))).toEqual({
      allowed: false,
      reason: 'DISPOSITION_EMPTY',
    });
  });

  it('hashes the exact bytes it was given', () => {
    const raw = JSON.stringify(approved);
    const verdict = verifyDisposition(raw);
    expect(verdict).toMatchObject({ allowed: true, hash: hashDisposition(raw) });
    // Re-serialising would change the hash, which is why the worker passes the file's bytes.
    expect(hashDisposition(raw)).not.toBe(hashDisposition(`${raw}\n`));
  });

  it('refuses the disposition this repository actually ships today', async () => {
    // Deliberate. Nobody has reviewed it, so the worker must not dispose of anything. When a
    // human approves the file this test changes with them, and that is the moment worth noticing.
    const raw = await readFile('docs/legal/data-disposition.v1.json', 'utf8');
    expect(verifyDisposition(raw)).toEqual({
      allowed: false,
      reason: 'DISPOSITION_NOT_APPROVED:PROPOSED',
    });
  });
});
