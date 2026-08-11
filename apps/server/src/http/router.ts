import type { MobileApiHandlers } from './pet-handlers.js';
import { jsonResponse } from './errors.js';

type Route = Readonly<{
  method: 'GET' | 'POST';
  handle(request: Request): Promise<Response>;
  requiresJson?: boolean;
}>;

export type MobileApiRouterOptions = Readonly<{
  handlers: MobileApiHandlers;
  allowedOrigins?: readonly string[];
  maxRequestBodyBytes?: number;
}>;

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
  const routes = new Map<string, Route>([
    ['/v1/pets/collection', { method: 'GET', handle: options.handlers.getPetCollection }],
    ['/v1/learning/leaderboard', { method: 'GET', handle: options.handlers.getWeeklyLeaderboard }],
    ['/v1/pets/daily-draw', { method: 'POST', handle: options.handlers.claimDailyDraw }],
    ['/v1/pets/duplicate-promotion', { method: 'POST', handle: options.handlers.promoteDuplicates, requiresJson: true }],
  ]);

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') {
      if (request.method !== 'GET') {
        const response = jsonResponse(405, { code: 'METHOD_NOT_ALLOWED' });
        response.headers.set('allow', 'GET');
        return response;
      }
      return jsonResponse(200, { status: 'ok' });
    }

    const route = routes.get(url.pathname);
    if (route === undefined) return jsonResponse(404, { code: 'NOT_FOUND' });
    const origin = request.headers.get('origin');
    if (origin !== null && !isLoopbackOrigin(origin) && !allowedOrigins.has(origin)) {
      return jsonResponse(403, { code: 'ORIGIN_NOT_ALLOWED' });
    }
    if (request.method === 'OPTIONS' && origin !== null) {
      const requestedMethod = request.headers.get('access-control-request-method');
      const requestedHeaders = (request.headers.get('access-control-request-headers') ?? '')
        .split(',').map((header) => header.trim().toLowerCase()).filter(Boolean);
      const supportedHeaders = new Set(['authorization', 'content-type', 'idempotency-key']);
      if (requestedMethod !== route.method || requestedHeaders.some((header) => !supportedHeaders.has(header))) {
        return corsResponse(jsonResponse(403, { code: 'CORS_PREFLIGHT_REJECTED' }), origin);
      }
      const response = new Response(null, { status: 204 });
      response.headers.set('access-control-allow-methods', route.method);
      response.headers.set('access-control-allow-headers', requestedHeaders.join(', '));
      response.headers.set('access-control-max-age', '600');
      return corsResponse(response, origin);
    }
    if (request.method !== route.method) {
      const response = jsonResponse(405, { code: 'METHOD_NOT_ALLOWED' });
      response.headers.set('allow', route.method);
      return corsResponse(response, origin);
    }
    if (route.requiresJson === true && !hasJsonMediaType(request)) {
      return corsResponse(jsonResponse(415, { code: 'UNSUPPORTED_MEDIA_TYPE' }), origin);
    }

    try {
      const body = route.method === 'POST' ? await readLimitedBody(request, maxRequestBodyBytes) : null;
      return corsResponse(await route.handle(replaceBody(request, body)), origin);
    } catch (error) {
      if (error instanceof RangeError && error.message === 'REQUEST_TOO_LARGE') {
        return corsResponse(jsonResponse(413, { code: 'REQUEST_TOO_LARGE' }), origin);
      }
      return corsResponse(jsonResponse(500, { code: 'INTERNAL_ERROR' }), origin);
    }
  };
}
