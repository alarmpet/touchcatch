import { createHash } from 'node:crypto';

/**
 * Decides whether the worker is allowed to dispose of anything at all.
 *
 * Which rows survive a deletion request is a legal decision, and the person who makes it is not
 * the person who writes the SQL. So the worker refuses to run against a disposition nobody has
 * signed off: while `approval.status` is PROPOSED, a request is accepted, the account is closed,
 * and no data is touched. That is a worse product and an honest one — the alternative is
 * destroying data on the strength of a table an agent generated.
 *
 * The hash is recorded with each run so that "which disposition was in force when this account
 * was deleted" has an answer later, when the file has moved on.
 */

export type DispositionApproval = Readonly<{
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  scope: string | null;
}>;

export type DispositionDocument = Readonly<{
  approval: DispositionApproval;
  tables: ReadonlyArray<{ table: string; disposition: string }>;
}>;

export type DispositionVerdict =
  | Readonly<{ allowed: true; hash: string; deleteTableCount: number }>
  | Readonly<{ allowed: false; reason: string }>;

export function hashDisposition(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * @param raw the exact bytes of docs/legal/data-disposition.v1.json, so the hash names the file
 *   that was read rather than a re-serialisation of it.
 */
export function verifyDisposition(raw: string): DispositionVerdict {
  let document: DispositionDocument;
  try {
    document = JSON.parse(raw) as DispositionDocument;
  } catch {
    return { allowed: false, reason: 'DISPOSITION_UNPARSEABLE' };
  }

  const approval = document.approval;
  if (!approval || typeof approval.status !== 'string') {
    return { allowed: false, reason: 'DISPOSITION_APPROVAL_MISSING' };
  }
  if (approval.status !== 'APPROVED') {
    return { allowed: false, reason: `DISPOSITION_NOT_APPROVED:${approval.status}` };
  }
  // An approval with nobody's name on it is not an approval. This is the field that turns
  // "someone edited a JSON file" into "a person decided", so it is checked rather than trusted.
  if (!approval.approvedBy || !approval.approvedAt) {
    return { allowed: false, reason: 'DISPOSITION_APPROVAL_UNATTRIBUTED' };
  }
  if (!Array.isArray(document.tables) || document.tables.length === 0) {
    return { allowed: false, reason: 'DISPOSITION_EMPTY' };
  }

  const unknown = document.tables.filter(
    (row) => !['DELETE', 'REDACT', 'RETAIN'].includes(row.disposition),
  );
  if (unknown.length > 0) {
    return { allowed: false, reason: `DISPOSITION_UNKNOWN_VALUE:${unknown[0]!.table}` };
  }

  return {
    allowed: true,
    hash: hashDisposition(raw),
    deleteTableCount: document.tables.filter((row) => row.disposition === 'DELETE').length,
  };
}
