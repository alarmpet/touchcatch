import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const handoffPath = 'docs/operations/supabase-auth-provider-handoff.md';
const apiPath = '09_API_AND_SOCKET_EVENTS.md';

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

describe('Supabase Auth provider operations handoff', () => {
  it('separates provider callbacks from exact app redirect allow-list entries', () => {
    const handoff = read(handoffPath);
    expect(handoff).toContain('https://<project-ref>.supabase.co/auth/v1/callback');
    expect(handoff).toContain('spotlearn://auth/callback');
    expect(handoff).toContain('spotlearn://auth/recovery');
    expect(handoff).toMatch(/Google[^\n]+provider console[^\n]+Supabase callback/iu);
    expect(handoff).toMatch(/Kakao[^\n]+provider console[^\n]+Supabase callback/iu);
    expect(handoff).toMatch(/Supabase[^\n]+redirect allow-list[^\n]+app callback/iu);
  });

  it('records environment ownership, evidence, and honest release states', () => {
    const handoff = read(handoffPath);
    for (const environment of ['LOCAL', 'PREVIEW', 'PRODUCTION']) {
      expect(handoff).toMatch(new RegExp(`\\|\\s*${environment}\\s*\\|`, 'u'));
    }
    expect(handoff).toMatch(/secret storage location/iu);
    expect(handoff).toMatch(/owner/iu);
    expect(handoff).toMatch(/verifier/iu);
    expect(handoff).toMatch(/evidence path/iu);
    expect(handoff).toContain('PROVIDER_CREDENTIALS: BLOCKED');
    expect(handoff).toContain('LOCAL_AUTH_CODE: PASS');
    expect(handoff).toMatch(/iOS[^\n]+BLOCKED/iu);
    expect(handoff).toMatch(/Android[^\n]+not blocked/iu);
    expect(handoff).toMatch(/guest game play[^\n]+not blocked/iu);
  });

  it('uses status-derived Mailpit endpoints and excludes sensitive examples', () => {
    const handoff = read(handoffPath);
    expect(handoff).toMatch(/Mailpit/iu);
    expect(handoff).toMatch(/supabase status/iu);
    expect(handoff).not.toMatch(/Inbucket/iu);
    expect(handoff).not.toMatch(/(?:access_token|refresh_token|service_role)\s*[=:]/iu);
    expect(handoff).not.toMatch(/spotlearn:\/\/auth\/(?:callback|recovery)\?/iu);
  });

  it('projects the handoff into the API document and requirement evidence', () => {
    const api = read(apiPath);
    expect(api).toContain('docs/operations/supabase-auth-provider-handoff.md');
    expect(api).toContain('spotlearn://auth/callback');
    expect(api).toContain('spotlearn://auth/recovery');

    const evidence = JSON.parse(read('config/requirement-evidence.v1.json')) as {
      entries: Array<{ id: string; oracle: { expected: string }; externalEvidence?: Record<string, unknown> }>;
    };
    const sec001 = evidence.entries.find((entry) => entry.id === 'SEC-001');
    expect(sec001?.oracle.expected).toBe('PASS');
    expect(sec001?.externalEvidence).toMatchObject({
      status: 'BLOCKED',
      externalKind: 'PROVIDER_CREDENTIALS',
      evidencePath: handoffPath,
      localEvidenceScope: 'LOCAL_AUTH_CODE_AND_INTEGRATION',
    });
  });
});
