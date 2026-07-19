import { describe, expect, it } from 'vitest';
import { safeAuditEvent } from './server/audit.js';

describe('publish audit redaction', () => {
  it('allows only aggregate opaque identifiers and never payloads, PII, answers, secrets or raw source hashes', () => {
    const event = safeAuditEvent({ action: 'PUBLISH_SUCCEEDED', actorId: 'actor-1', sessionId: 'session-1', artifactId: 'artifact-approved-1', contentRevisionId: 'revision-1', occurredAt: '2026-07-19T00:00:00.000Z' }, 'audit-key-with-at-least-32-characters');
    expect(Object.keys(event).sort()).toEqual(['action', 'actorRef', 'artifactId', 'contentRevisionId', 'occurredAt', 'sessionRef']);
    expect(JSON.stringify(event)).not.toMatch(/actor-1|session-1|answer|secret|source|bytes|sha256/u);
  });
});
