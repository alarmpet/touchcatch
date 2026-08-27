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

  it('accepts the disposition this repository actually ships today', async () => {
    // This assertion used to read `allowed: false, DISPOSITION_NOT_APPROVED:PROPOSED`, and it
    // changed on 2026-08-27 when 신향섭 approved the file. That flip is the whole point of the
    // test: it is the line in the suite that says a person has decided, so it must never be
    // edited to follow the file -- only alongside a real approval, with the count below read
    // off the table rather than pasted from a failure message.
    const raw = await readFile('docs/legal/data-disposition.v1.json', 'utf8');
    const verdict = verifyDisposition(raw);
    expect(verdict).toMatchObject({ allowed: true, deleteTableCount: 24 });
    expect(verdict).toHaveProperty('hash');
  });

  it('names who approved the shipped disposition and when', async () => {
    // An approval with nobody on it is what the verifier already refuses; this pins that the
    // shipped file carries a real attribution rather than a placeholder that happens to parse.
    const raw = await readFile('docs/legal/data-disposition.v1.json', 'utf8');
    const { approval } = JSON.parse(raw) as {
      approval: { status: string; approvedBy: string | null; approvedAt: string | null };
    };
    expect(approval.status).toBe('APPROVED');
    expect(approval.approvedBy).toBeTruthy();
    expect(Number.isNaN(Date.parse(approval.approvedAt ?? ''))).toBe(false);
  });
});
