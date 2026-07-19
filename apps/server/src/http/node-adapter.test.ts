import { once } from 'node:events';
import { expect, it, vi } from 'vitest';
import { createNodeServer } from './node-adapter.js';

it('exposes the Fetch router through a real Node HTTP listener', async () => {
  const server = createNodeServer(async (request) => Response.json({ path: new URL(request.url).pathname }, { status: 201 }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { const address = server.address(); if (!address || typeof address === 'string') throw new Error('listener missing'); const response = await fetch(`http://127.0.0.1:${address.port}/v1/learning/progress/merge`); expect(response.status).toBe(201); await expect(response.json()).resolves.toEqual({ path: '/v1/learning/progress/merge' }); }
  finally { server.close(); await once(server, 'close'); }
});

it('rejects request bodies beyond the configured byte limit before routing', async () => {
  const router = vi.fn(async () => Response.json({ ok: true }));
  const server = createNodeServer(router, { maxBodyBytes: 8 });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('listener missing');
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/learning/progress/merge`, { method: 'POST', body: '123456789' });
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ code: 'PAYLOAD_TOO_LARGE' });
    expect(router).not.toHaveBeenCalled();
  } finally { server.close(); await once(server, 'close'); }
});
