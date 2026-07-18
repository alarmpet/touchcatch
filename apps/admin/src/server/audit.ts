import { createHmac } from 'node:crypto';

type AuditInput = Readonly<{
  action: 'VALIDATION_FAILED' | 'VALIDATION_SUCCEEDED' | 'PUBLISH_FAILED' | 'PUBLISH_SUCCEEDED';
  actorId: string;
  sessionId: string;
  artifactId: string;
  contentRevisionId: string;
  occurredAt: string;
}>;

export function safeAuditEvent(input: AuditInput, auditKey: string) {
  if (auditKey.length < 32) throw new Error('AUDIT_KEY_TOO_SHORT');
  const exact = ['action', 'actorId', 'artifactId', 'contentRevisionId', 'occurredAt', 'sessionId'];
  if (Object.keys(input).sort().join(',') !== exact.sort().join(',')) throw new Error('AUDIT_SHAPE_INVALID');
  const identifiers = `${input.artifactId}\n${input.contentRevisionId}`;
  if (/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d ()-]{8,}\d/u.test(identifiers)) throw new Error('AUDIT_VALUE_INVALID');
  const opaque = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/u;
  if (!opaque.test(input.artifactId) || !opaque.test(input.contentRevisionId) || !Number.isFinite(Date.parse(input.occurredAt))) throw new Error('AUDIT_VALUE_INVALID');
  const reference = (scope: string, value: string) => createHmac('sha256', auditKey).update(`${scope}:${value}`).digest('base64url').slice(0, 22);
  return {
    action: input.action,
    actorRef: reference('actor', input.actorId),
    sessionRef: reference('session', input.sessionId),
    artifactId: input.artifactId,
    contentRevisionId: input.contentRevisionId,
    occurredAt: input.occurredAt,
  };
}
import 'server-only';
