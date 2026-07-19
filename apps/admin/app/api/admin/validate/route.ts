export const runtime = 'nodejs';
export async function POST(request: Request) { const { adminHandlers } = await import('../../../../src/server/runtime.js'); return adminHandlers.validate(request); }
