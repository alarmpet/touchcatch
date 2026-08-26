import type { MobileApiHandlers } from './pet-handlers.js';
import { jsonResponse } from './errors.js';

type Route = Readonly<{
  method: 'GET' | 'POST' | 'DELETE';
  handle(request: Request, attemptId: string): Promise<Response>;
  requiresJson?: boolean;
  maxBodyBytes?: number;
}>;

/**
 * Loose on the identifier by design: the attempt handlers answer a malformed id with
 * 400 INVALID_REQUEST, which is more useful than the 404 a stricter pattern would give.
 */
const attemptSubPath = /^\/v1\/learning\/attempts\/([0-9a-fA-F-]{36})\/(assets-ready|tap|complete)$/u;

/** A completed attempt ships its whole command log, so it needs more room than a claim. */
const ATTEMPT_COMPLETE_MAX_BODY_BYTES = 64 * 1024;

export type ReadinessReport = Readonly<{
  status: 'ready' | 'not_ready';
  code?: 'DATABASE_UNAVAILABLE' | 'ATTEMPTS_POLICY_DISABLED' | 'DEPENDENCY_UNAVAILABLE';
}>;

export type MobileApiRouterOptions = Readonly<{
  handlers: MobileApiHandlers;
  allowedOrigins?: readonly string[];
  maxRequestBodyBytes?: number;
  probeReadiness?: () => Promise<ReadinessReport>;
}>;

/** Public HTTP operations implemented by the Fetch router. `/healthz` and `/ready` are intentionally unlisted probes. */
export const PUBLIC_MOBILE_API_OPERATIONS = [
  { method: 'GET', path: '/v1/me' },
  { method: 'DELETE', path: '/v1/me' },
  { method: 'POST', path: '/v1/me/deletion-status' },
  { method: 'GET', path: '/v1/pets/collection' },
  { method: 'GET', path: '/v1/learning/leaderboard' },
  { method: 'POST', path: '/v1/pets/daily-draw' },
  { method: 'POST', path: '/v1/pets/duplicate-promotion' },
  { method: 'GET', path: '/v1/learning/challenges' },
  { method: 'POST', path: '/v1/learning/attempts' },
  { method: 'POST', path: '/v1/learning/attempts/{id}/assets-ready' },
  { method: 'POST', path: '/v1/learning/attempts/{id}/tap' },
  { method: 'POST', path: '/v1/learning/attempts/{id}/complete' },
] as const;

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
      && url.username === '' && url.password === '' && url.pathname === '/'
      && url.search === '' && url.hash === '';
  } catch {
    return false;
  }
}

function hasJsonMediaType(request: Request): boolean {
  const value = request.headers.get('content-type');
  if (value === null) return false;
  return value.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

async function readLimitedBody(request: Request, limit: number): Promise<ArrayBuffer | null> {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > limit)) {
    throw new RangeError('REQUEST_TOO_LARGE');
  }
  if (request.body === null) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel('REQUEST_TOO_LARGE');
      throw new RangeError('REQUEST_TOO_LARGE');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

function replaceBody(request: Request, body: ArrayBuffer | null): Request {
  if (body === null) return request;
  const init: RequestInit & { duplex: 'half' } = {
    method: request.method,
    headers: request.headers,
    body,
    redirect: request.redirect,
    signal: request.signal,
    duplex: 'half',
  };
  return new Request(request.url, init);
}

function corsResponse(response: Response, origin: string | null): Response {
  if (origin === null) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.append('vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createMobileApiRouter(options: MobileApiRouterOptions): (request: Request) => Promise<Response> {
  const maxRequestBodyBytes = options.maxRequestBodyBytes ?? 16 * 1024;
  if (!Number.isSafeInteger(maxRequestBodyBytes) || maxRequestBodyBytes < 0) {
    throw new TypeError('maxRequestBodyBytes must be a non-negative safe integer');
  }
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const routes = new Map<string, Route[]>([
    ['/v1/me', [
      { method: 'GET', handle: options.handlers.getMe },
      { method: 'DELETE', handle: options.handlers.deleteMe, requiresJson: true },
    ]],
    ['/v1/me/deletion-status', [{ method: 'POST', handle: options.handlers.readDeletionStatus, requiresJson: true }]],
    ['/v1/pets/collection', [{ method: 'GET', handle: options.handlers.getPetCollection }]],
    ['/v1/learning/leaderboard', [{ method: 'GET', handle: options.handlers.getWeeklyLeaderboard }]],
    ['/v1/pets/daily-draw', [{ method: 'POST', handle: options.handlers.claimDailyDraw }]],
    ['/v1/pets/duplicate-promotion', [{ method: 'POST', handle: options.handlers.promoteDuplicates, requiresJson: true }]],
    ['/v1/learning/challenges', [{ method: 'GET', handle: options.handlers.getWeeklyChallenges }]],
    ['/v1/learning/attempts', [{ method: 'POST', handle: options.handlers.startAttempt, requiresJson: true }]],
  ]);
  const attemptSubRoutes: Readonly<Record<string, Route>> = {
    'assets-ready': { method: 'POST', handle: options.handlers.attestAttemptAssets, requiresJson: true },
    // Tap requires Idempotency-Key. Two physical taps at the same point are two events
    // and must use two keys; a retried transport uses the same key so the server does
    // not charge a second miss.
    tap: { method: 'POST', handle: options.handlers.tapAttempt, requiresJson: true },
    complete: {
      method: 'POST',
      handle: options.handlers.completeAttempt,
      requiresJson: true,
      maxBodyBytes: ATTEMPT_COMPLETE_MAX_BODY_BYTES,
    },
  };

  function resolve(pathname: string, method: string): Readonly<{ route?: Route; allowedMethods: string[]; attemptId: string }> | undefined {
    const exact = routes.get(pathname);
    if (exact !== undefined) {
      const allowedMethods = exact.map((r) => r.method);
      const route = exact.find((r) => r.method === method);
      return { ...(route === undefined ? {} : { route }), allowedMethods, attemptId: '' };
    }
    const match = attemptSubPath.exec(pathname);
    if (match === null) return undefined;
    const subRoute = attemptSubRoutes[match[2]!];
    if (subRoute === undefined) return undefined;
    return {
      ...(subRoute.method === method ? { route: subRoute } : {}),
      allowedMethods: [subRoute.method],
      attemptId: match[1]!,
    };
  }

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/healthz' || url.pathname === '/ready') {
      if (request.method !== 'GET') {
        const response = jsonResponse(405, { code: 'METHOD_NOT_ALLOWED' });
        response.headers.set('allow', 'GET');
        return response;
      }
      if (url.pathname === '/healthz') return jsonResponse(200, { status: 'ok' });
      try {
        const report = options.probeReadiness === undefined
          ? { status: 'not_ready' as const, code: 'DEPENDENCY_UNAVAILABLE' as const }
          : await options.probeReadiness();
        if (report.status === 'ready') return jsonResponse(200, { status: 'ready' });
        return jsonResponse(503, { status: 'not_ready', code: report.code ?? 'DEPENDENCY_UNAVAILABLE' });
      } catch {
        return jsonResponse(503, { status: 'not_ready', code: 'DEPENDENCY_UNAVAILABLE' });
      }
    }

    const matched = resolve(url.pathname, request.method);
    if (matched === undefined) return jsonResponse(404, { code: 'NOT_FOUND' });
    const { route, allowedMethods, attemptId } = matched;
    const origin = request.headers.get('origin');
    if (origin !== null && !isLoopbackOrigin(origin) && !allowedOrigins.has(origin)) {
      return jsonResponse(403, { code: 'ORIGIN_NOT_ALLOWED' });
    }
    if (request.method === 'OPTIONS' && origin !== null) {
      const requestedMethod = request.headers.get('access-control-request-method');
      const requestedHeaders = (request.headers.get('access-control-request-headers') ?? '')
        .split(',').map((header) => header.trim().toLowerCase()).filter(Boolean);
      const supportedHeaders = new Set(['authorization', 'content-type', 'idempotency-key']);
      if (!allowedMethods.includes(requestedMethod ?? '') || requestedHeaders.some((header) => !supportedHeaders.has(header))) {
        return corsResponse(jsonResponse(403, { code: 'CORS_PREFLIGHT_REJECTED' }), origin);
      }
      const response = new Response(null, { status: 204 });
      response.headers.set('access-control-allow-methods', allowedMethods.join(', '));
      response.headers.set('access-control-allow-headers', requestedHeaders.join(', '));
      response.headers.set('access-control-max-age', '600');
      return corsResponse(response, origin);
    }
    if (route === undefined) {
      const response = jsonResponse(405, { code: 'METHOD_NOT_ALLOWED' });
      response.headers.set('allow', allowedMethods.join(', '));
      return corsResponse(response, origin);
    }
    if (route.requiresJson === true && !hasJsonMediaType(request)) {
      return corsResponse(jsonResponse(415, { code: 'UNSUPPORTED_MEDIA_TYPE' }), origin);
    }

    try {
      const limit = route.maxBodyBytes ?? maxRequestBodyBytes;
      const body = route.method === 'POST' ? await readLimitedBody(request, limit) : null;
      return corsResponse(await route.handle(replaceBody(request, body), attemptId), origin);
    } catch (error) {
      if (error instanceof RangeError && error.message === 'REQUEST_TOO_LARGE') {
        return corsResponse(jsonResponse(413, { code: 'REQUEST_TOO_LARGE' }), origin);
      }
      return corsResponse(jsonResponse(500, { code: 'INTERNAL_ERROR' }), origin);
    }
  };
}
