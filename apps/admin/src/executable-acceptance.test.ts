import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { bootstrapBrowserSession, type BrowserAuthShell } from './client/session-bootstrap.js';
import { createAdminHandlers } from './server/handlers.js';
import { createAdminSessionBootstrap, createCookieSessionAuth } from './server/auth.js';
import { readSessionCookie, sessionCookieHeaders } from './server/session-cookie.js';

describe('admin executable acceptance', () => {
  it('bootstraps a browser session through the auth shell without persisting the access token', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const auth: BrowserAuthShell = { acquireAccessToken: async () => 'ephemeral-token' };
    const state = await bootstrapBrowserSession(auth, async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, csrfToken: 'csrf-state' }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    expect(state).toEqual({ status: 'ready', csrfToken: 'csrf-state' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { authorization: 'Bearer ephemeral-token' } });
    expect(JSON.stringify(state)).not.toContain('ephemeral-token');
  });

  it('uses an explicit auth provider instead of an undeclared global', async () => {
    const auth: BrowserAuthShell = { acquireAccessToken: async () => 'explicit-token' };
    const calls: string[] = [];
    const state = await bootstrapBrowserSession(auth, async (_url, init) => { calls.push(String(new Headers(init?.headers).get('authorization'))); return Response.json({ ok: true, csrfToken: 'csrf' }); });
    expect(state).toEqual({ status: 'ready', csrfToken: 'csrf' });
    expect(calls).toEqual(['Bearer explicit-token']);
  });

  it('uses definer-only audit writers, opaque keyed artifact refs, and no direct production inserts', async () => {
    const migration = await readFile('supabase/migrations/202607190001_admin_publish_receipts.sql', 'utf8');
    const runtime = await readFile('apps/admin/src/server/runtime.ts', 'utf8');
    expect(migration).toContain('write_admin_publish_audit_v1');
    expect(migration).toMatch(/security definer set search_path = pg_catalog/gu);
    expect(migration).toMatch(/revoke all on private\.admin_publish_audit/gu);
    expect(runtime).toContain('private.write_admin_publish_audit_v1');
    expect(runtime).not.toMatch(/insert into private\.admin_publish_audit/iu);
    expect(migration).not.toContain("'artifact:'||p_request_hash");
  });

  it('keeps legacy workflow stores outside the production server graph', async () => {
    await expect(readFile('apps/admin/src/server/publish-workflow.ts', 'utf8')).rejects.toThrow();
    await expect(readFile('apps/admin/src/server/deployment-publisher.ts', 'utf8')).rejects.toThrow();
    await expect(readFile('apps/admin/src/server/receipt-store.ts', 'utf8')).rejects.toThrow();
  });

  it('preserves the publish failure when the post-rollback failure audit is unavailable', async () => {
    const handlers = createAdminHandlers({
      authenticate: async () => ({ actorId: 'actor', sessionId: 'session', roles: ['CONTENT_PUBLISHER'] }),
      intake: async () => ({ artifact: {}, artifactSha256: 'a'.repeat(64), assets: {} as never }),
      validate: async () => ({ ok: false, errors: [] }), issueAttestation: async () => '',
      publish: async () => { throw new Error('DEPLOYMENT_ROLLED_BACK'); },
      audit: async () => { throw new Error('AUDIT_UNAVAILABLE'); },
    });
    const response = await handlers.publish(new Request('https://admin.test/api/admin/publish', { method: 'POST', body: new FormData() }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'DEPLOYMENT_ROLLED_BACK' } });
  });

  it('never records ZERO_EFFECT while a durable receipt outcome is ambiguous', async () => {
    const audits:string[]=[];
    const handlers=createAdminHandlers({authenticate:async()=>({actorId:'actor',sessionId:'session',roles:['CONTENT_PUBLISHER']}),intake:async()=>({artifact:{},artifactSha256:'a'.repeat(64),assets:{} as never}),validate:async()=>({ok:false,errors:[]}),issueAttestation:async()=>'',publish:async()=>{throw Error('OUTCOME_UNKNOWN:RETRY_SAME_KEY');},audit:async event=>{audits.push(event.outcome);}});
    const response=await handlers.publish(new Request('https://admin.test/api/admin/publish',{method:'POST',body:new FormData()}));
    expect(await response.json()).toEqual({ok:false,error:{code:'OUTCOME_UNKNOWN'}});
    expect(audits).toEqual([]);
  });

  it('wires browser bootstrap through route cookies and CSRF into the validate handler',async()=>{
    const sessions=new Map<string,{sessionId:string;actorId:string;roles:readonly string[]}>();
    const bootstrap=createAdminSessionBootstrap({allowedOrigin:'https://admin.test',verifyToken:async token=>{expect(token).toBe('explicit-token');return{actorId:'actor-1'};},createSession:async session=>{sessions.set(session.sessionHash,{sessionId:session.sessionId,actorId:session.actorId,roles:['CONTENT_PUBLISHER']});},randomToken:()=> 'A'.repeat(24),hashSession:value=>`hash:${value}`,cookieHeaders:sessionCookieHeaders});
    let cookies='';
    const state=await bootstrapBrowserSession({acquireAccessToken:async()=> 'explicit-token'},async(_url,init)=>{const response=await bootstrap(new Request('https://admin.test/api/admin/session',{method:'POST',headers:{...Object.fromEntries(new Headers(init?.headers)),origin:'https://admin.test'}}));cookies=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');return response;});
    expect(state.status).toBe('ready');if(state.status!=='ready')return;
    const cookieAuth=createCookieSessionAuth({hashSession:value=>`hash:${value}`,loadSession:async hash=>sessions.get(hash)??null});
    const handlers=createAdminHandlers({authenticate:request=>cookieAuth.authenticate({sessionId:readSessionCookie(request.headers.get('cookie')),origin:request.headers.get('origin'),allowedOrigin:'https://admin.test',csrfCookie:/(?:^|;\s*)admin_csrf=([^;]+)/u.exec(request.headers.get('cookie')??'')?.[1]??null,csrfHeader:request.headers.get('x-csrf-token')}),intake:async()=>({artifact:{},artifactSha256:'a'.repeat(64),assets:{} as never}),validate:async()=>({ok:false,errors:[{path:'/',ruleId:'EXPECTED',message:'reached'}]}),issueAttestation:async()=>'',publish:async()=>{throw Error('unused');},audit:async()=>undefined});
    const response=await handlers.validate(new Request('https://admin.test/api/admin/validate',{method:'POST',headers:{origin:'https://admin.test',cookie:cookies,'x-csrf-token':state.csrfToken},body:new FormData()}));
    expect(response.status).toBe(422);
  });
});
