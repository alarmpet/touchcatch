import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';

export type NodeServerHandle = Readonly<{
  origin: string;
  closed: Promise<void>;
  close(): Promise<void>;
}>;

export type NodeServerOptions = Readonly<{
  fetch(request: Request): Promise<Response>;
  host?: string;
  port?: number;
  signal?: AbortSignal;
  shutdownGraceMs?: number;
  dependencyShutdownGraceMs?: number;
  closeDependencies?(): Promise<void>;
  forceCloseDependencies?(error: Error): void;
}>;

class RequestBoundaryError extends Error {
  constructor(readonly code: 'INVALID_REQUEST_TARGET' | 'INVALID_REQUEST_BODY') {
    super(code);
  }
}

function nodeRequestToFetch(request: IncomingMessage, origin: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
    else if (value !== undefined) headers.set(name, value);
  }
  const method = request.method ?? 'GET';
  const target = request.url ?? '/';
  const queryOffset = target.indexOf('?');
  const rawPath = queryOffset === -1 ? target : target.slice(0, queryOffset);
  const url = new URL(target, origin);
  if (!target.startsWith('/') || target.startsWith('//') || rawPath !== url.pathname || url.origin !== origin) {
    throw new RequestBoundaryError('INVALID_REQUEST_TARGET');
  }
  if ((method === 'GET' || method === 'HEAD')
    && (request.headers['content-length'] !== undefined || request.headers['transfer-encoding'] !== undefined)) {
    throw new RequestBoundaryError('INVALID_REQUEST_BODY');
  }
  const init: RequestInit & { duplex?: 'half' } = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>;
    init.duplex = 'half';
  }
  return new Request(url, init);
}

async function writeFetchResponse(response: Response, target: ServerResponse): Promise<void> {
  target.statusCode = response.status;
  target.statusMessage = response.statusText;
  response.headers.forEach((value, name) => target.setHeader(name, value));
  if (response.body === null) {
    target.end();
    return;
  }
  const body = Buffer.from(await response.arrayBuffer());
  target.end(body);
}

async function waitWithin(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    promise.then(() => {
      clearTimeout(timer);
      resolve(true);
    }, (error: unknown) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export async function startNodeServer(options: NodeServerOptions): Promise<NodeServerHandle> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  const shutdownGraceMs = options.shutdownGraceMs ?? 5_000;
  const dependencyShutdownGraceMs = options.dependencyShutdownGraceMs ?? 5_000;
  if (!Number.isSafeInteger(shutdownGraceMs) || shutdownGraceMs < 0) {
    throw new TypeError('shutdownGraceMs must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(dependencyShutdownGraceMs) || dependencyShutdownGraceMs < 0) {
    throw new TypeError('dependencyShutdownGraceMs must be a non-negative safe integer');
  }
  let origin = '';
  const server = createServer((request, response) => {
    void (async () => {
      try {
        await writeFetchResponse(await options.fetch(nodeRequestToFetch(request, origin)), response);
      } catch (error) {
        if (error instanceof RequestBoundaryError) request.resume();
        if (!response.headersSent) {
          response.statusCode = error instanceof RequestBoundaryError ? 400 : 500;
          response.setHeader('content-type', 'application/json; charset=utf-8');
        }
        response.end(JSON.stringify({ code: error instanceof RequestBoundaryError ? error.code : 'INTERNAL_ERROR' }));
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  const displayHost = address.address.includes(':') ? `[${address.address}]` : address.address;
  origin = `http://${displayHost}:${address.port}`;

  let closePromise: Promise<void> | undefined;
  let resolveClosed: (() => void) | undefined;
  let rejectClosed: ((error: unknown) => void) | undefined;
  const closed = new Promise<void>((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });
  const close = (): Promise<void> => {
    closePromise ??= (async () => {
      let serverError: Error | undefined;
      await new Promise<void>((resolve) => {
        const forceTimer = setTimeout(() => server.closeAllConnections(), shutdownGraceMs);
        server.close((error) => {
          clearTimeout(forceTimer);
          serverError = error;
          resolve();
        });
        server.closeIdleConnections();
      });
      try {
        const dependencyClose = options.closeDependencies?.();
        if (dependencyClose !== undefined && !await waitWithin(dependencyClose, dependencyShutdownGraceMs)) {
          options.forceCloseDependencies?.(new Error('DEPENDENCY_SHUTDOWN_TIMEOUT'));
          if (!await waitWithin(dependencyClose, dependencyShutdownGraceMs)) {
            throw new Error('DEPENDENCY_SHUTDOWN_TIMEOUT');
          }
        }
        if (serverError !== undefined) throw serverError;
        resolveClosed?.();
      } catch (error) {
        rejectClosed?.(error);
        throw error;
      }
    })();
    return closePromise;
  };
  options.signal?.addEventListener('abort', () => { void close().catch(() => undefined); }, { once: true });
  if (options.signal?.aborted === true) void close().catch(() => undefined);

  return { origin, closed, close };
}
