import { request as rawHttpRequest } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { startNodeServer } from './node-server.js';

function rawRequest(origin: string, path: string, input: Readonly<{ method?: string; body?: string }> = {}): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(origin);
    const body = input.body ?? '';
    const request = rawHttpRequest({
      hostname: url.hostname,
      port: url.port,
      path,
      method: input.method ?? 'GET',
      headers: body === '' ? {} : { 'content-length': Buffer.byteLength(body) },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

describe('Node Fetch bridge lifecycle', () => {
  it('serves an ephemeral port and closes listeners plus dependencies on abort', async () => {
    const controller = new AbortController();
    const closeDependencies = vi.fn().mockResolvedValue(undefined);
    const server = await startNodeServer({
      fetch: async () => Response.json({ status: 'ok' }),
      host: '127.0.0.1',
      port: 0,
      signal: controller.signal,
      closeDependencies,
    });

    const response = await fetch(`${server.origin}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });

    controller.abort();
    await server.closed;
    expect(closeDependencies).toHaveBeenCalledOnce();
    await expect(fetch(`${server.origin}/healthz`)).rejects.toThrow();
  });

  it('bounds graceful shutdown and destroys a slow active socket before closing dependencies', async () => {
    const controller = new AbortController();
    let markRequestStarted: (() => void) | undefined;
    const requestStarted = new Promise<void>((resolve) => { markRequestStarted = resolve; });
    const closeDependencies = vi.fn().mockResolvedValue(undefined);
    const server = await startNodeServer({
      fetch: async () => {
        markRequestStarted?.();
        return new Promise<Response>(() => undefined);
      },
      host: '127.0.0.1',
      port: 0,
      signal: controller.signal,
      shutdownGraceMs: 10,
      closeDependencies,
    });
    const pendingRequest = fetch(`${server.origin}/slow`);
    await requestStarted;
    controller.abort();
    await expect(server.closed).resolves.toBeUndefined();
    await expect(pendingRequest).rejects.toThrow();
    expect(closeDependencies).toHaveBeenCalledOnce();
  });

  it('rejects noncanonical raw targets and GET bodies before the Fetch router', async () => {
    const handler = vi.fn(async () => Response.json({ reached: true }));
    const server = await startNodeServer({ fetch: handler, host: '127.0.0.1', port: 0 });
    try {
      expect(await rawRequest(server.origin, '/v1/pets/x/../collection')).toEqual({ status: 400, body: { code: 'INVALID_REQUEST_TARGET' } });
      expect(await rawRequest(server.origin, '/v1\\pets\\collection')).toEqual({ status: 400, body: { code: 'INVALID_REQUEST_TARGET' } });
      expect(await rawRequest(server.origin, '/v1/pets/collection', { body: '{}' })).toEqual({ status: 400, body: { code: 'INVALID_REQUEST_BODY' } });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});
