import 'server-only';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { validateFixtureObject } from '../../../../packages/content-validator/src/validate-content.js';
import type { ContentValidationResult } from '../../../../packages/contracts/src/index.js';
import type { intakeMultipart } from './intake.js';

type Submission = Awaited<ReturnType<typeof intakeMultipart>>;
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

export function createSubmittedArtifactValidator(allowedAssetOrigins: readonly string[]) {
  return async (submission: Submission): Promise<ContentValidationResult> => {
    const directory = await mkdtemp(join(tmpdir(), 'touchcatch-admin-'));
    try {
      if (!record(submission.artifact) || !record(submission.artifact.publicContent)) return { ok: false, errors: [{ path: '/', ruleId: 'SCHEMA_BUNDLE', message: 'artifact must be an object' }] };
      const artifact = structuredClone(submission.artifact);
      if (!record(artifact) || !record(artifact.publicContent)) throw new Error('unreachable');
      const assetFiles: Record<string, string> = {};
      for (const side of ['imageA', 'imageB'] as const) {
        const declared = artifact.publicContent[side];
        const submitted = submission.assets[side];
        if (!record(declared) || declared.sha256 !== submitted.sha256 || declared.mimeType !== submitted.mimeType) return { ok: false, errors: [{ path: `/publicContent/${side}`, ruleId: 'ASSET_SUBMISSION_MISMATCH', message: 'submitted asset bytes do not match the exact declared asset' }] };
        const filename = `${submitted.sha256}${extname(submitted.locator)}`;
        await writeFile(join(directory, filename), submitted.bytes, { flag: 'wx' });
        assetFiles[submitted.sha256] = filename;
      }
      if (record(artifact.assetFiles) && Object.keys(artifact.assetFiles).sort().join(',') !== Object.keys(assetFiles).sort().join(',')) return { ok: false, errors: [{ path: '/assetFiles', ruleId: 'ASSET_SUBMISSION_MISMATCH', message: 'A/B asset association must be exact' }] };
      artifact.assetFiles = assetFiles;
      return await validateFixtureObject(artifact, { fixturePath: 'submitted', assetRoot: directory, allowedAssetOrigins });
    } finally { await rm(directory, { recursive: true, force: true }); }
  };
}
