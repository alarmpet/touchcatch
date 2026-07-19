import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
type Router = (request: Request) => Promise<Response>;
class PayloadTooLargeError extends Error {}
async function toRequest(request: IncomingMessage, maxBodyBytes: number): Promise<Request> {
  const contentLength = Number(request.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) throw new PayloadTooLargeError();
  const chunks: Buffer[] = []; let bodyBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bodyBytes += buffer.byteLength;
    if (bodyBytes > maxBodyBytes) throw new PayloadTooLargeError();
    chunks.push(buffer);
  }
  const headers = new Headers(); for (const [key, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
  const method = request.method ?? 'GET'; const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  const init: RequestInit = method === 'GET' || method === 'HEAD' ? { method, headers } : { method, headers, body: body ?? null };
  return new Request(`http://${request.headers.host ?? '127.0.0.1'}${request.url ?? '/'}`, init);
}
async function send(response: ServerResponse, result: Response) { response.statusCode = result.status; result.headers.forEach((value, key) => response.setHeader(key, value)); response.end(Buffer.from(await result.arrayBuffer())); }
export function createNodeServer(router: Router, options: Readonly<{ maxBodyBytes?: number }> = {}) {
  const maxBodyBytes = options.maxBodyBytes ?? 256 * 1024;
  const server = createServer((request, response) => {
    void toRequest(request, maxBodyBytes)
      .then(router)
      .then((result) => send(response, result))
      .catch((error: unknown) => send(response, error instanceof PayloadTooLargeError
        ? Response.json({ code: 'PAYLOAD_TOO_LARGE' }, { status: 413 })
        : Response.json({ code: 'INTERNAL_ERROR' }, { status: 500 })));
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
