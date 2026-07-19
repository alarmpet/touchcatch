type Provider = 'google' | 'kakao';
type Identity = Readonly<{ id?: string; identity_id?: string; provider?: string }>;
type ReauthProof = Readonly<{ email: string; token: string }>;
type AuthResult<T> = Promise<{ data?: T; error?: unknown }>;
type IdentityAuth = Readonly<{
  reauthenticate?(): AuthResult<unknown>;
  verifyOtp(input: { email: string; token: string; type: 'reauthentication' }): AuthResult<unknown>;
  getUserIdentities(): AuthResult<{ identities?: Identity[] | null }>;
  linkIdentity(input: { provider: Provider; options: { redirectTo: string; skipBrowserRedirect: true } }): AuthResult<{ url?: string | null }>;
  unlinkIdentity(identity: Identity): AuthResult<unknown>;
  exchangeCodeForSession?(code: string): AuthResult<unknown>;
}>;
type LinkingDependencies = Readonly<{ storage: Readonly<{ getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<void>;removeItem(key:string):Promise<void> }>; browser: Readonly<{ openAuthSessionAsync(url:string,redirectUrl:string):Promise<{type:string;url?:string}> }> }>;
const viableProviders = new Set(['email', 'google', 'kakao']);
const callbackUrl = 'spotlearn://auth/callback'; const pendingKey = 'touchcatch.auth.pkce.pending';
type PendingLink = Readonly<{ kind: 'identity-link'; provider: Provider; stage?: 'authorization-pending' | 'exchanging' | 'verification-pending'; callbackUrl?: string }>;
function errorCode(error: unknown): string { return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : 'IDENTITY_OPERATION_FAILED'; }
function callbackCode(raw:string):string { const url=new URL(raw);if(url.protocol!=='spotlearn:'||url.hostname!=='auth'||url.pathname!=='/callback'||url.hash)throw new Error('INVALID_IDENTITY_CALLBACK');const code=url.searchParams.get('code');if(!code||[...url.searchParams.keys()].some(key=>key!=='code'))throw new Error('INVALID_IDENTITY_CALLBACK');return code; }

export function createIdentityCoordinator(auth: IdentityAuth, dependencies?: LinkingDependencies) {
  const linkCompletions = new Map<string, Promise<{ status: 'LINKED'; provider: Provider }>>();
  const reauthenticate = async (proof: ReauthProof) => { const result = await auth.verifyOtp({ ...proof, type: 'reauthentication' }); if (result.error) throw new Error(errorCode(result.error)); };
  const identities = async () => {
    const result = await auth.getUserIdentities(); if (result.error) throw new Error(errorCode(result.error));
    return (result.data?.identities ?? []).filter((identity) => viableProviders.has(identity.provider ?? '') && typeof (identity.identity_id ?? identity.id) === 'string');
  };
  const verifyLinked = async (provider: Provider) => {
    if (!dependencies) throw new Error('IDENTITY_LINK_CALLBACK_UNAVAILABLE');
    const linked=await identities();if(!linked.some(identity=>identity.provider===provider))throw new Error('IDENTITY_STATE_CONFLICT');
    await dependencies.storage.removeItem(pendingKey);return {status:'LINKED' as const,provider};
  };
  const runCompleteLink = async (rawUrl:string) => {
    if (!dependencies || !auth.exchangeCodeForSession) throw new Error('IDENTITY_LINK_CALLBACK_UNAVAILABLE');
    const pendingRaw=await dependencies.storage.getItem(pendingKey);if(!pendingRaw)throw new Error('IDENTITY_LINK_PENDING_MISSING');
    const pending=JSON.parse(pendingRaw) as PendingLink;if(pending.kind!=='identity-link'||!pending.provider)throw new Error('IDENTITY_LINK_PENDING_INVALID');
    await dependencies.storage.setItem(pendingKey,JSON.stringify({...pending,stage:'exchanging',callbackUrl:rawUrl}));
    const result=await auth.exchangeCodeForSession(callbackCode(rawUrl));if(result.error)throw new Error(errorCode(result.error));
    await dependencies.storage.setItem(pendingKey,JSON.stringify({kind:'identity-link',provider:pending.provider,stage:'verification-pending'}));
    return verifyLinked(pending.provider);
  };
  const completeLink = (rawUrl:string) => {
    const existing=linkCompletions.get(rawUrl);if(existing)return existing;
    const operation=runCompleteLink(rawUrl);linkCompletions.set(rawUrl,operation);void operation.finally(()=>linkCompletions.delete(rawUrl)).catch(()=>undefined);return operation;
  };
  return {
    completeLink,
    async resumeLink() {
      if (!dependencies) return null;
      const pendingRaw=await dependencies.storage.getItem(pendingKey);if(!pendingRaw)return null;
      const pending=JSON.parse(pendingRaw) as PendingLink;
      if(pending.kind!=='identity-link'||!pending.provider)throw new Error('IDENTITY_LINK_PENDING_INVALID');
      if(pending.stage==='verification-pending')return verifyLinked(pending.provider);
      if(pending.stage!=='exchanging')return null;
      const current=await identities();
      if(current.some(identity=>identity.provider===pending.provider)){
        await dependencies.storage.removeItem(pendingKey);return {status:'LINKED' as const,provider:pending.provider};
      }
      if(!pending.callbackUrl)throw new Error('IDENTITY_LINK_PENDING_INVALID');
      try{return await runCompleteLink(pending.callbackUrl);}
      catch(error){
        const reconciled=await identities();
        if(reconciled.some(identity=>identity.provider===pending.provider)){
          await dependencies.storage.removeItem(pendingKey);return {status:'LINKED' as const,provider:pending.provider};
        }
        throw error;
      }
    },
    async requestReauthentication() {
      if (!auth.reauthenticate) throw new Error('REAUTHENTICATION_UNAVAILABLE');
      const result = await auth.reauthenticate(); if (result.error) throw new Error(errorCode(result.error));
      return { status: 'OTP_SENT' as const };
    },
    async link(provider: Provider, proof: ReauthProof) {
      await reauthenticate(proof);
      if ((await identities()).some((identity) => identity.provider === provider)) return { status: 'ALREADY_LINKED' as const };
      const result = await auth.linkIdentity({ provider, options: { redirectTo: callbackUrl, skipBrowserRedirect: true } });
      if (result.error) throw new Error(errorCode(result.error));
      if (!result.data?.url) throw new Error('IDENTITY_AUTHORIZATION_URL_MISSING');
      if(!dependencies)return { status: 'AUTHORIZATION_REQUIRED' as const, url: result.data.url };
      await dependencies.storage.setItem(pendingKey,JSON.stringify({kind:'identity-link',provider,stage:'authorization-pending'}));
      const browserResult=await dependencies.browser.openAuthSessionAsync(result.data.url,callbackUrl);
      if(browserResult.type!=='success'||!browserResult.url){await dependencies.storage.removeItem(pendingKey);throw new Error('IDENTITY_LINK_CANCELLED');}
      return completeLink(browserResult.url);
    },
    async unlink(identityId: string, proof: ReauthProof) {
      await reauthenticate(proof);
      const current = await identities();
      if (current.length < 2) throw new Error('LAST_IDENTITY');
      const target = current.find((identity) => (identity.identity_id ?? identity.id) === identityId);
      if (!target) throw new Error('IDENTITY_NOT_FOUND');
      const result = await auth.unlinkIdentity(target); if (result.error) throw new Error(errorCode(result.error));
      const refreshed = await identities();
      if (refreshed.length < 1 || refreshed.some((identity) => (identity.identity_id ?? identity.id) === identityId)) throw new Error('IDENTITY_STATE_CONFLICT');
      return { status: 'UNLINKED' as const };
    },
  };
}
