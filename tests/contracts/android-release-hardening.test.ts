import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const androidRoot = 'apps/mobile/android/app';

describe('android release hardening', () => {
  // The release config used to fall back to the debug keystore that is committed to this
  // repository. That produces a plausible-looking .aab signed by a key everyone has, and
  // nothing downstream distinguishes it from a real one. Missing secrets must fail the build.
  it('refuses to sign a release with the tracked debug keystore', async () => {
    const gradle = await readFile(resolve(androidRoot, 'build.gradle'), 'utf8');
    const releaseConfig = /signingConfigs \{[\s\S]*?\n {8}release \{([\s\S]*?)\n {8}\}/u.exec(gradle)?.[1];

    expect(releaseConfig).toBeTruthy();
    expect(releaseConfig).not.toMatch(/debug\.keystore|androiddebugkey/u);
    for (const name of ['KEYSTORE_PATH', 'KEYSTORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD']) {
      expect(gradle).toContain(name);
    }
    expect(gradle).toMatch(/gradle\.taskGraph\.whenReady/u);
    expect(gradle).toMatch(/throw new GradleException\("Missing release signing inputs/u);
  });

  // Auto Backup would copy the app's private storage - which holds the persisted Supabase
  // session - into the user's Google Drive, outside anything the privacy policy describes.
  it('keeps Android Auto Backup off so persisted sessions stay on the device', async () => {
    const manifest = await readFile(resolve(androidRoot, 'src/main/AndroidManifest.xml'), 'utf8');

    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).not.toContain('android:allowBackup="true"');
  });

  // Every permission in the release manifest has to be answerable in the Data safety form.
  // The storage and overlay permissions arrive transitively and the app uses neither.
  it('ships only the permissions the release build actually exercises', async () => {
    const main = await readFile(resolve(androidRoot, 'src/main/AndroidManifest.xml'), 'utf8');
    const release = await readFile(resolve(androidRoot, 'src/release/AndroidManifest.xml'), 'utf8');
    const requested = [...main.matchAll(/<uses-permission android:name="([^"]+)"\s*\/>/gu)].map((m) => m[1]);

    expect(requested).toEqual(['android.permission.INTERNET', 'android.permission.VIBRATE']);
    for (const permission of ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'SYSTEM_ALERT_WINDOW']) {
      expect(release).toContain(`android.permission.${permission}" tools:node="remove"`);
    }
  });

  // Without a checksum the wrapper installs whatever the distribution URL happens to serve, so
  // the toolchain that signs the release bundle is not pinned to anything verifiable.
  it('pins the Gradle distribution by checksum', async () => {
    const wrapper = await readFile(resolve('apps/mobile/android/gradle/wrapper/gradle-wrapper.properties'), 'utf8');
    const version = /gradle-([\d.]+)-bin\.zip/u.exec(wrapper)?.[1];

    expect(version).toBeTruthy();
    expect(wrapper).toMatch(/^distributionSha256Sum=[0-9a-f]{64}$/mu);
    expect(wrapper).toContain('validateDistributionUrl=true');
  });

  // Everything above reads source. None of it proves what the merged release manifest holds:
  // libraries contribute permissions the source never mentions, and `tools:node="remove"` only
  // takes effect at merge time. Four permissions arrive purely from dependencies
  // (expo-audio, react-native, androidx) and they are what the Data safety declaration has to
  // answer for - not the two lines in src/main.
  //
  // The merged file only exists after a release build, so this is skipped when absent. Run:
  //   ./gradlew :app:processReleaseMainManifest   (requires the four signing env vars)
  it('pins the merged release manifest, where library permissions actually land', async () => {
    const merged = await readFile(
      resolve(androidRoot, 'build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml'),
      'utf8',
    ).catch(() => '');

    if (merged === '') return; // no local release build output; CI is the real gate
    const permissions = [...merged.matchAll(/<uses-permission android:name="([^"]+)" \/>/gu)].map((m) => m[1]);

    expect(permissions.sort()).toEqual([
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.INTERNET',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.VIBRATE',
      'android.permission.WAKE_LOCK',
      'com.touchcatch.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
    ]);
    // From 2026-08-31 Play requires new apps *and updates* to target Android 16.
    expect(merged).toMatch(/android:targetSdkVersion="(3[6-9]|[4-9]\d)"/u);
    expect(merged).toContain('android:allowBackup="false"');
    expect(merged).toContain('package="com.touchcatch.mobile"');
    expect(merged).toContain('<data android:scheme="touchcatch" />');
  });
});
