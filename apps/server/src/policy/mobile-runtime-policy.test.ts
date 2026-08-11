import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artifactSha256, signableApprovalRecord } from '../../../../tools/check-pet-runtime-approval.mjs';
import { loadMobileRuntimePolicy } from './mobile-runtime-policy.js';
import { verifiedRuntimeAssetHashes } from '../runtime.js';

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(path), 'utf8')) as Record<string, unknown>;

const draftEconomy = readJson('config/economy.v1.json');
const draftCatalog = readJson('config/pet-catalog.v1.json');
const draftDailyPetLoop = readJson('config/daily-pet-loop.v1.json');
const draftWeeklyCompetition = readJson('config/weekly-competition.v1.json');

const approval = {
  status: 'APPROVED',
  approvalDecisionId: 'runtime-policy-approval-2026-08-11',
  approvedBy: 'product-owner',
  approvedAt: '2026-08-11T09:30:00.000Z',
} as const;
const signingKey = generateKeyPairSync('ed25519');
const trustedApprovalSigners = { schemaVersion: 1, status: 'APPROVED', keys: [{ keyId: 'release-key-1', status: 'ACTIVE', publicKeyPem: signingKey.publicKey.export({ type: 'spki', format: 'pem' }).toString() }] };
const trustedApprovalSignerRegistrySha256 = artifactSha256(trustedApprovalSigners);
const signed = <T extends Record<string, unknown>>(record: T) => ({ ...record, signerKeyId: 'release-key-1', signature: sign(null, Buffer.from(signableApprovalRecord(record)), signingKey.privateKey).toString('base64') });

function approvedBundle() {
  const catalog = { ...structuredClone(draftCatalog), ...approval };
  const economy = {
    ...structuredClone(draftEconomy),
    ...approval,
    catalogRevision: draftCatalog['catalogRevision'],
    catalogHash: draftCatalog['catalogHash'],
  };
  const bundle = {
    economy,
    catalog,
    dailyPetLoop: { ...structuredClone(draftDailyPetLoop), ...approval },
    weeklyCompetition: { ...structuredClone(draftWeeklyCompetition), ...approval },
    petRuntimeArt: {
      schemaVersion: 1,
      ...approval,
      catalogRevision: draftCatalog['catalogRevision'],
      catalogHash: draftCatalog['catalogHash'],
      entries: (draftCatalog['entries'] as Array<{ petId: string }>).map((entry, index) => {
        const thumbnailSha256 = (index + 100).toString(16).padStart(64, '0');
        const fullSha256 = (index + 200).toString(16).padStart(64, '0');
        return {
        petId: entry.petId,
        sourceFile: `pet-${index}.png`,
        sourceSha256: index.toString(16).padStart(64, '0'),
        thumbnailFile: `content/pets/runtime/${thumbnailSha256}-thumb.webp`,
        thumbnailUrl: `https://cdn.example.com/pets/${entry.petId}/${thumbnailSha256}/thumb.webp`,
        thumbnailSha256,
        fullFile: `content/pets/runtime/${fullSha256}-full.webp`,
        fullUrl: `https://cdn.example.com/pets/${entry.petId}/${fullSha256}/full.webp`,
        fullSha256,
        rights: {
          evidenceId: `rights-${index}`,
          approvedBy: 'rights-owner',
          approvedAt: approval.approvedAt,
        },
        visual: {
          reviewId: `visual-${index}`,
          smallCardApproved: true,
          cropApproved: true,
          backgroundApproved: true,
          approvedBy: 'art-director',
          approvedAt: approval.approvedAt,
        },
      }; }),
    },
  };
  const sourceManifest = {
    schemaVersion: 1,
    admissions: bundle.petRuntimeArt.entries.map((entry, index) => ({
      fileName: entry.sourceFile,
      sourceSha256: entry.sourceSha256,
      normalizedSlug: `pet-${index}`,
      candidateRarity: 'COMMON', familySlug: null, provenanceNote: 'approved test fixture', coachArchetype: 'SCOUT', width: 1, height: 1, pixelFormat: 'RGBA',
      rightsStatus: 'APPROVED', visualReview: 'APPROVED', backgroundReview: 'APPROVED', cropReview: 'APPROVED',
    })),
  };
  const rightsEvidence = { schemaVersion: 1, status: 'APPROVED', entries: bundle.petRuntimeArt.entries.map((entry, index) => ({
    rightsEvidenceId: entry.rights.evidenceId, sourceSha256: entry.sourceSha256, basis: 'OWNED',
    provenanceReference: `provenance-${index}`, permissionReference: `permission-${index}`, takedownOwnerKey: 'legal-ops',
    status: 'APPROVED', reviewedBy: 'rights-owner', reviewedAt: approval.approvedAt,
  })) };
  const binding = (path: string, artifact: unknown) => ({ path, sha256: artifactSha256(artifact) });
  const approvalRecords = [
    { approvalGroup: 'PET_ECONOMY_V1', decisionId: approval.approvalDecisionId, approvedBy: approval.approvedBy, approvedAt: approval.approvedAt, artifacts: [binding('config/economy.v1.json', economy), binding('config/pet-catalog.v1.json', catalog)] },
    { approvalGroup: 'DAILY_PET_LOOP_V1', decisionId: approval.approvalDecisionId, approvedBy: approval.approvedBy, approvedAt: approval.approvedAt, artifacts: [binding('config/daily-pet-loop.v1.json', bundle.dailyPetLoop)] },
    { approvalGroup: 'WEEKLY_COMPETITION_V1', decisionId: approval.approvalDecisionId, approvedBy: approval.approvedBy, approvedAt: approval.approvedAt, artifacts: [binding('config/weekly-competition.v1.json', bundle.weeklyCompetition)] },
    { approvalGroup: 'PET_RUNTIME_ART_V1', decisionId: approval.approvalDecisionId, approvedBy: approval.approvedBy, approvedAt: approval.approvedAt, artifacts: [binding('config/pet-runtime-art.v1.json', bundle.petRuntimeArt), binding('content/pets/source-manifest.v1.json', sourceManifest), binding('config/pet-rights-evidence.v1.json', rightsEvidence)] },
  ].map(signed);
  const assetFileHashes = Object.fromEntries(bundle.petRuntimeArt.entries.flatMap((entry) => [[entry.thumbnailFile, entry.thumbnailSha256], [entry.fullFile, entry.fullSha256]]));
  return { ...bundle, sourceManifest, rightsEvidence, approvalRecords, trustedApprovalSigners, trustedApprovalSignerRegistrySha256, assetFileHashes };
}

describe('mobile runtime policy gates', () => {
  it('returns named disabled states without throwing for the current DRAFT artifacts', () => {
    const state = loadMobileRuntimePolicy({
      economy: draftEconomy,
      catalog: draftCatalog,
      dailyPetLoop: draftDailyPetLoop,
      weeklyCompetition: draftWeeklyCompetition,
    });

    expect(state).toEqual({
      rewards: { enabled: false, code: 'PET_ART_NOT_APPROVED' },
      ranking: { enabled: false, code: 'RANKING_POLICY_NOT_APPROVED' },
    });
  });

  it('keeps rewards disabled when approved policy has no approved art mapping', () => {
    const { petRuntimeArt: _petRuntimeArt, ...approvedWithoutArt } = approvedBundle();

    expect(loadMobileRuntimePolicy(approvedWithoutArt).rewards).toEqual({
      enabled: false,
      code: 'PET_ART_NOT_APPROVED',
    });
  });

  it('rejects stale or incomplete runtime art mappings', () => {
    const approved = approvedBundle();
    const staleArt = {
      ...approved.petRuntimeArt,
      catalogHash: 'f'.repeat(64),
    };
    expect(loadMobileRuntimePolicy({ ...approved, petRuntimeArt: staleArt }).rewards).toEqual({
      enabled: false,
      code: 'PET_ART_NOT_APPROVED',
    });

    const incompleteArt = {
      ...approved.petRuntimeArt,
      entries: approved.petRuntimeArt.entries.slice(1),
    };
    expect(loadMobileRuntimePolicy({ ...approved, petRuntimeArt: incompleteArt }).rewards).toEqual({
      enabled: false,
      code: 'PET_ART_NOT_APPROVED',
    });
  });

  it('keeps reward and ranking approval gates independent', () => {
    const approved = approvedBundle();

    const rankingDraft = loadMobileRuntimePolicy({
      ...approved,
      weeklyCompetition: draftWeeklyCompetition,
    });
    expect(rankingDraft.rewards.enabled).toBe(true);
    expect(rankingDraft.ranking).toEqual({
      enabled: false,
      code: 'RANKING_POLICY_NOT_APPROVED',
    });

    const dailyDraft = loadMobileRuntimePolicy({
      ...approved,
      dailyPetLoop: draftDailyPetLoop,
    });
    expect(dailyDraft.rewards).toEqual({
      enabled: false,
      code: 'REWARD_POLICY_NOT_APPROVED',
    });
    expect(dailyDraft.ranking.enabled).toBe(true);
  });

  it('rejects self-declared APPROVED artifacts without signed hash bindings', () => {
    const approved = approvedBundle();
    expect(loadMobileRuntimePolicy({ ...approved, approvalRecords: [] })).toEqual({
      rewards: { enabled: false, code: 'PET_ART_NOT_APPROVED' },
      ranking: { enabled: false, code: 'RANKING_POLICY_NOT_APPROVED' },
    });
  });

  it('fails closed after one byte of an approved runtime asset changes on disk', () => {
    const approved = approvedBundle();
    mkdirSync('D:\\tcbuild', { recursive: true });
    const root = mkdtempSync('D:\\tcbuild\\pet-art-byte-mutation-');
    try {
      const thumbnailBytes = Buffer.from('approved-thumbnail'); const fullBytes = Buffer.from('approved-full');
      const thumbnailSha256 = createHash('sha256').update(thumbnailBytes).digest('hex');
      const fullSha256 = createHash('sha256').update(fullBytes).digest('hex');
      const first = { ...approved.petRuntimeArt.entries[0],
        thumbnailFile: `content/pets/runtime/${thumbnailSha256}-thumb.webp`, thumbnailSha256,
        thumbnailUrl: `https://cdn.example.com/pets/${thumbnailSha256}/thumb.webp`,
        fullFile: `content/pets/runtime/${fullSha256}-full.webp`, fullSha256,
        fullUrl: `https://cdn.example.com/pets/${fullSha256}/full.webp` };
      const petRuntimeArt = { ...approved.petRuntimeArt, entries: [first, ...approved.petRuntimeArt.entries.slice(1)] };
      const artDirectory = resolve(root, 'content/pets/runtime'); mkdirSync(artDirectory, { recursive: true });
      writeFileSync(resolve(root, first.thumbnailFile), thumbnailBytes); writeFileSync(resolve(root, first.fullFile), fullBytes);
      const approvalRecords = approved.approvalRecords.map((record) => {
        if (record.approvalGroup !== 'PET_RUNTIME_ART_V1') return record;
        const unsigned = { approvalGroup: record.approvalGroup, decisionId: record.decisionId, approvedBy: record.approvedBy, approvedAt: record.approvedAt,
          artifacts: record.artifacts.map((item) => item.path === 'config/pet-runtime-art.v1.json' ? { ...item, sha256: artifactSha256(petRuntimeArt) } : item) };
        return signed(unsigned);
      });
      const diskHashes = verifiedRuntimeAssetHashes(root, { entries: [first] });
      const input = { ...approved, petRuntimeArt, approvalRecords, assetFileHashes: { ...approved.assetFileHashes, ...diskHashes } };
      expect(loadMobileRuntimePolicy(input).rewards.enabled).toBe(true);

      writeFileSync(resolve(root, first.thumbnailFile), Buffer.concat([thumbnailBytes, Buffer.from([0])]));
      const changedHashes = verifiedRuntimeAssetHashes(root, { entries: [first] });
      expect(loadMobileRuntimePolicy({ ...input, assetFileHashes: { ...approved.assetFileHashes, ...changedHashes } }).rewards)
        .toEqual({ enabled: false, code: 'PET_ART_NOT_APPROVED' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('fails closed when an approved dependency uses a test-only approval identity', () => {
    const approved = approvedBundle();
    const testApprovedEconomy = {
      ...approved.economy,
      approvedBy: 'test-product-owner',
    };

    expect(loadMobileRuntimePolicy({
      ...approved,
      economy: testApprovedEconomy,
    })).toEqual({
      rewards: { enabled: false, code: 'REWARD_POLICY_NOT_APPROVED' },
      ranking: { enabled: false, code: 'RANKING_POLICY_NOT_APPROVED' },
    });
  });
});
