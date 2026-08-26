import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/**
 * Keeps the Play Data safety declaration and the privacy policy answerable from the code.
 *
 * The version of these documents replaced on 2026-08-26 declared that the app collected crash
 * logs and diagnostics. It does not: `apps/mobile/package.json` has no telemetry SDK of any
 * kind. Over-declaring is a policy violation in the same way under-declaring is, and the
 * mistake is invisible in review because nobody re-derives the answer from the dependency list.
 *
 * These assertions are deliberately about *claims that would become false*, not about wording.
 * Adding Sentry is a legitimate change; shipping it while the store listing still says "no
 * diagnostics" is not, and this is the test that stops the second half.
 */

const telemetryPackages = [
  '@sentry/',
  'posthog',
  'bugsnag',
  'mixpanel',
  'amplitude',
  'appsflyer',
  'react-native-firebase',
  'firebase',
  '@datadog/',
  'react-native-fbsdk',
  'segment',
  'countly',
  'instabug',
] as const;

async function mobileDependencies(): Promise<string[]> {
  const pkg = JSON.parse(await readFile('apps/mobile/package.json', 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  return Object.keys(pkg.dependencies ?? {});
}

describe('play data safety declaration', () => {
  it('declares no diagnostics while the app ships no telemetry SDK', async () => {
    const dependencies = await mobileDependencies();
    const telemetry = dependencies.filter((name) =>
      telemetryPackages.some((needle) => name.includes(needle)),
    );
    const declaration = await readFile('docs/legal/google-play-data-safety.md', 'utf8');

    if (telemetry.length === 0) {
      // Both rows carry a bold **아니오** so a careless edit to one of them is visible here.
      expect(declaration).toContain('| App info and performance | Crash logs | **아니오**');
      expect(declaration).toContain('| App info and performance | Diagnostics | **아니오**');
    } else {
      throw new Error(
        `apps/mobile now depends on ${telemetry.join(', ')}. Update the Crash logs and ` +
          'Diagnostics rows in docs/legal/google-play-data-safety.md and section 2 of ' +
          'docs/legal/privacy-policy.md before shipping, then relax this test.',
      );
    }
  });

  it('keeps the privacy policy honest about the permissions the release build asks for', async () => {
    const releaseManifest = await readFile(
      'apps/mobile/android/app/src/release/AndroidManifest.xml',
      'utf8',
    );
    const mainManifest = await readFile(
      'apps/mobile/android/app/src/main/AndroidManifest.xml',
      'utf8',
    );
    const policy = await readFile('docs/legal/privacy-policy.md', 'utf8');

    // The policy tells readers the release build asks for INTERNET and VIBRATE and nothing
    // else. That is only true while src/release keeps stripping what the libraries declare.
    for (const permission of [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ]) {
      expect(releaseManifest).toContain(`<uses-permission android:name="${permission}" tools:node="remove"/>`);
    }

    const declared = [...mainManifest.matchAll(/<uses-permission android:name="([^"]+)"/gu)].map(
      (match) => match[1],
    );
    expect(declared.toSorted()).toEqual([
      'android.permission.INTERNET',
      'android.permission.VIBRATE',
    ]);

    expect(policy).toContain('`INTERNET`과 `VIBRATE` 두 가지뿐입니다');
    expect(mainManifest).toContain('android:allowBackup="false"');
    expect(policy).toContain('allowBackup=false');
  });

  it('does not name a support address outside the operator identity source', async () => {
    // A hard-coded address in a legal document is how `support@touchcatch.com` -- a domain
    // nobody owns -- ended up published as the deletion contact.
    for (const source of [
      'docs/legal/privacy-policy.md',
      'docs/legal/terms-of-service.md',
      'docs/legal/account-deletion-notice.md',
      'docs/legal/support.md',
    ]) {
      const text = await readFile(source, 'utf8');
      const addresses = [...text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/gu)].map((m) => m[0]);
      expect(addresses, `${source} hard-codes an email address`).toEqual([]);
    }
  });
});
