export const runtime = 'nodejs';
export async function POST(request: Request) { const { bootstrapAdminSession } = await import('../../../../src/server/runtime.js'); return bootstrapAdminSession(request); }
