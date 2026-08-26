import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'smol-toml';

interface SupabaseAuthConfig {
  additional_redirect_urls?: unknown;
  enable_manual_linking?: unknown;
  external?: Record<string, { enabled?: unknown }>;
}

describe('mobile OAuth local configuration', () => {
  it('allows only the exact app callback required by the restored PKCE boundary', async () => {
    const parsed = parse(await readFile(resolve('supabase/config.toml'), 'utf8')) as {
      auth?: SupabaseAuthConfig;
    };

    expect(parsed.auth?.additional_redirect_urls).toEqual(['touchcatch://auth/callback']);
    expect(parsed.auth?.enable_manual_linking).toBe(true);
  });

  it('does not claim the unconfigured local Kakao provider is enabled', async () => {
    const parsed = parse(await readFile(resolve('supabase/config.toml'), 'utf8')) as {
      auth?: SupabaseAuthConfig;
    };

    // Google is deliberately absent from this check: it has a real OAuth client and reads its
    // credentials from the shell via env(), so enabled = true is the truth there.
    //
    // Kakao has no client yet. Enabling it would make GoTrue advertise a provider that answers
    // "Unsupported provider" on every attempt — the failure this test exists to prevent, and
    // one that reads as a client bug rather than missing configuration.
    expect(parsed.auth?.external?.kakao?.enabled).not.toBe(true);
  });

  it('generates Android with the callback scheme and canonical package identity', async () => {
    const app = JSON.parse(await readFile(resolve('apps/mobile/app.json'), 'utf8')) as {
      expo?: { name?: unknown; scheme?: unknown; android?: { package?: unknown } };
    };

    expect(app.expo?.name).toBe('TouchCatch');
    expect(app.expo?.scheme).toBe('touchcatch');
    expect(app.expo?.android?.package).toBe('com.touchcatch.mobile');
  });

  // `app.config.js` outranks `app.json`, so a name/slug/scheme restated there wins silently.
  // That is exactly how the store rename to TouchCatch shipped a build still called
  // Spot Learn Battle, still registering `spotlearn://` — which would have sent every OAuth
  // callback to a scheme no activity claimed. app.json stays the single identity source.
  it('keeps app.config.js from restating identity that app.json already owns', async () => {
    const config = await readFile(resolve('apps/mobile/app.config.js'), 'utf8');
    const body = config.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '');

    for (const key of ['name', 'slug', 'scheme', 'version', 'android', 'ios']) {
      expect(body).not.toMatch(new RegExp(`(^|[^\\w.])${key}\\s*:`, 'u'));
    }
  });

  // The native project is checked in rather than regenerated per build, so nothing forces it
  // to follow app.json. Each of these drifted at least once already.
  it('pins the native Android project to the same identity as app.json', async () => {
    const app = JSON.parse(await readFile(resolve('apps/mobile/app.json'), 'utf8')) as {
      expo?: { name?: string; scheme?: string; android?: { package?: string } };
    };
    const scheme = app.expo?.scheme;
    const manifest = await readFile(resolve('apps/mobile/android/app/src/main/AndroidManifest.xml'), 'utf8');
    const strings = await readFile(resolve('apps/mobile/android/app/src/main/res/values/strings.xml'), 'utf8');
    const gradle = await readFile(resolve('apps/mobile/android/app/build.gradle'), 'utf8');
    const coordinator = await readFile(resolve('apps/mobile/src/auth/oauth-coordinator.ts'), 'utf8');
    const callbackRoute = await readFile(resolve('apps/mobile/app/auth/callback.tsx'), 'utf8');

    // `https` belongs to the browser <queries> block, not to a deep link this app claims.
    const declaredSchemes = [...manifest.matchAll(/<data android:scheme="([^"]+)"\/>/gu)].map((m) => m[1]);
    expect(declaredSchemes.filter((s) => s !== 'http' && s !== 'https')).toEqual([scheme]);
    expect(strings).toContain(`<string name="app_name">${app.expo?.name}</string>`);
    expect(gradle).toContain(`applicationId '${app.expo?.android?.package}'`);
    expect(gradle).toContain(`namespace '${app.expo?.android?.package}'`);
    expect(coordinator).toContain(`const callbackUrl = '${scheme}://auth/callback';`);
    expect(coordinator).toContain(`url.protocol !== '${scheme}:'`);
    expect(callbackRoute).toContain(`const callbackUrl = '${scheme}://auth/callback';`);
  });

  // The server now offers durable deletion: a request that commits an access tombstone in the
  // same transaction and answers 202. What it must never go back to is the shape it had before
  // -- `deleteMe` answering 200 {"deleted":true} with an optional dependency that did nothing.
  it('describes deletion as a durable request rather than a synchronous success', async () => {
    const spec = await readFile(resolve('packages/contracts/openapi.yaml'), 'utf8');

    expect(spec).toContain('operationId: requestAccountDeletion');
    expect(spec).toContain('/v1/me/deletion-status');
    expect(spec).not.toMatch(/DeleteMeResponse|required: \[deleted\]/u);
  });

  // The in-app path Play requires, with the two properties that make it honest: the receipt is
  // written before the request goes out, and the session latches closed so a late auth callback
  // cannot reopen an account the server has already blocked.
  it('ships an in-app deletion path that survives a crash and cannot be reopened', async () => {
    const client = await readFile(resolve('apps/mobile/src/privacy/account-deletion-client.ts'), 'utf8');
    const controller = await readFile(resolve('apps/mobile/src/auth/session-controller.ts'), 'utf8');
    const profile = await readFile(resolve('apps/mobile/app/profile.tsx'), 'utf8');

    expect(profile).toContain('AccountDeletionCard');
    expect(controller).toContain('closeForDeletion');
    // The old shape: a local sign-out dressed up as deletion. It must not come back.
    expect(controller).not.toMatch(/deleteAccount/u);
    // Persist-then-send. Reversing these loses the only credential that can resolve the request.
    expect(client.indexOf('storage.setItem')).toBeLessThan(client.indexOf('transport.requestDeletion'));
  });

  it('keeps test modules outside the Expo Router route graph', async () => {
    const routeFiles = await readdir(resolve('apps/mobile/app'), { recursive: true });

    expect(routeFiles.filter((file) => /\.test\.[cm]?[jt]sx?$/.test(file))).toEqual([]);
  });
});
