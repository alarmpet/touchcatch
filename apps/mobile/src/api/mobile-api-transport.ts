import type { PetApiRequest, PetApiTransport } from '../features/pets/pet-api';
import type { RankingClientRequest, RankingClientTransport } from '../features/ranking/ranking-client';

export interface AccessTokenProvider {
  getAccessToken(): Promise<string | null>;
  refreshAccessToken?(): Promise<string | null>;
}

export class MobileApiError extends Error {
  constructor(readonly code: string, readonly status: number | null) {
    super(code);
    this.name = 'MobileApiError';
  }
}

type RequestInput = PetApiRequest | RankingClientRequest;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function createIdempotencyKey(randomUUID: () => string = () => crypto.randomUUID()): string {
  const value = randomUUID().toLowerCase();
  if (!uuidV4.test(value)) throw new Error('IDEMPOTENCY_KEY_GENERATION_FAILED');
  return value;
}

function normalizeOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new TypeError('MOBILE_API_ORIGIN_INVALID'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.origin !== value) {
    throw new TypeError('MOBILE_API_ORIGIN_INVALID');
  }
  return url.origin;
}

function requestUrl(origin: string, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new TypeError('MOBILE_API_PATH_INVALID');
  const url = new URL(path, origin);
  if (url.origin !== origin || `${url.pathname}${url.search}` !== path) throw new TypeError('MOBILE_API_PATH_INVALID');
  return url.toString();
}

type Attempt = Readonly<{ status: number; ok: boolean; body: unknown }>;

function errorFrom(attempt: Attempt): MobileApiError {
  let code = `HTTP_${attempt.status}`;
  if (attempt.body !== null && typeof attempt.body === 'object' && typeof (attempt.body as { code?: unknown }).code === 'string') {
    code = (attempt.body as { code: string }).code;
  }
  return new MobileApiError(code, attempt.status);
}

export function createMobileApiTransport(input: Readonly<{
  baseUrl: string;
  tokens: AccessTokenProvider;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}>): PetApiTransport & RankingClientTransport {
  const origin = normalizeOrigin(input.baseUrl);
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 15_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('MOBILE_API_TIMEOUT_INVALID');

  async function perform(request: RequestInput, token: string): Promise<Attempt> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const headers = new Headers({ authorization: `Bearer ${token}` });
      if ('idempotencyKey' in request && request.idempotencyKey) headers.set('idempotency-key', request.idempotencyKey);
      const hasBody = 'body' in request && request.body !== undefined;
      if (hasBody) headers.set('content-type', 'application/json');
      const response = await fetchImpl(requestUrl(origin, request.path), {
        method: request.method,
        headers,
        ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
        signal: controller.signal,
      });
      let body: unknown = null;
      try { body = await response.json() as unknown; }
      catch {
        if (timedOut) throw new MobileApiError('NETWORK_TIMEOUT', null);
        if (response.ok) throw new MobileApiError('RESPONSE_INVALID', response.status);
      }
      return { status: response.status, ok: response.ok, body };
    } catch (error) {
      if (error instanceof MobileApiError) throw error;
      if (timedOut) throw new MobileApiError('NETWORK_TIMEOUT', null);
      throw new MobileApiError('NETWORK_UNAVAILABLE', null);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async request<T>(request: RequestInput): Promise<T> {
      let token: string | null;
      try { token = await input.tokens.getAccessToken(); }
      catch { throw new MobileApiError('AUTH_SESSION_UNAVAILABLE', null); }
      if (!token?.trim()) throw new MobileApiError('AUTH_SESSION_REQUIRED', 401);
      let response = await perform(request, token);
      if (response.status === 401 && input.tokens.refreshAccessToken !== undefined) {
        let refreshed: string | null;
        try { refreshed = await input.tokens.refreshAccessToken(); }
        catch { throw new MobileApiError('AUTH_SESSION_UNAVAILABLE', null); }
        if (refreshed?.trim()) response = await perform(request, refreshed);
      }
      if (!response.ok) throw errorFrom(response);
      return response.body as T;
    },
  };
}
