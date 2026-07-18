export type VerifiedAdminSession = Readonly<{ actorId: string; sessionId: string; roles: readonly string[] }>;
export type AdminRequestProof = Readonly<{ authorization: string | null; origin: string | null; csrfCookie: string | null; csrfHeader: string | null }>;

export function createCookieSessionAuth(dependencies: Readonly<{ hashSession(value: string): string; loadSession(hash: string): Promise<VerifiedAdminSession | null> }>) {
  return { async authenticate(input: Readonly<{ sessionId: string | null; origin: string | null; allowedOrigin: string; csrfCookie: string | null; csrfHeader: string | null }>) {
    if (input.origin !== input.allowedOrigin) throw new Error('ORIGIN_MISMATCH');
    if (!input.csrfCookie || input.csrfCookie !== input.csrfHeader) throw new Error('CSRF_MISMATCH');
    if (!input.sessionId) throw new Error('UNAUTHORIZED');
    const session = await dependencies.loadSession(dependencies.hashSession(input.sessionId));
    if (!session) throw new Error('UNAUTHORIZED');
    if (!session.roles.includes('CONTENT_PUBLISHER')) throw new Error('FORBIDDEN');
    return session;
  } };
}

export function createAdminSessionBootstrap(dependencies: Readonly<{
  allowedOrigin:string;
  verifyToken(token:string):Promise<Readonly<{actorId:string}>>;
  createSession(value:Readonly<{sessionId:string;sessionHash:string;actorId:string}>):Promise<void>;
  randomToken():string;
  hashSession(value:string):string;
  cookieHeaders(sessionId:string,csrfToken:string):readonly string[];
}>) {
  return async (request:Request):Promise<Response>=>{
    if(request.headers.get('origin')!==dependencies.allowedOrigin)return Response.json({ok:false},{status:403});
    const match=/^Bearer ([A-Za-z0-9._~-]{8,4096})$/u.exec(request.headers.get('authorization')??'');
    if(!match)return Response.json({ok:false},{status:401});
    const verified=await dependencies.verifyToken(match[1]!);const sessionId=dependencies.randomToken();const csrfToken=dependencies.randomToken();
    await dependencies.createSession({sessionId,sessionHash:dependencies.hashSession(sessionId),actorId:verified.actorId});
    const response=Response.json({ok:true,csrfToken});for(const cookie of dependencies.cookieHeaders(sessionId,csrfToken))response.headers.append('set-cookie',cookie);return response;
  };
}

import 'server-only';
