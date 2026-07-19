import 'server-only';

const SESSION = /^[A-Za-z0-9_-]{16,128}$/u;

export function sessionCookieHeaders(sessionId: string, csrfToken: string): readonly [string, string] {
  if (!SESSION.test(sessionId) || !SESSION.test(csrfToken)) throw new Error('SESSION_COOKIE_INVALID');
  return [
    `admin_session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`,
    `admin_csrf=${csrfToken}; Secure; SameSite=Strict; Path=/; Max-Age=3600`,
  ];
}

export function readSessionCookie(cookie: string | null): string | null {
  const value = /(?:^|;\s*)admin_session=([A-Za-z0-9_-]{16,128})(?:;|$)/u.exec(cookie ?? '')?.[1];
  return value ?? null;
}
