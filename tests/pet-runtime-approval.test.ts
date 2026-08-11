import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artifactSha256, evaluatePetRuntimeApproval, signableApprovalRecord } from '../tools/check-pet-runtime-approval.mjs';

const approvedAt = '2026-08-11T09:30:00.000Z';
const signingKey = generateKeyPairSync('ed25519');
const trustedApprovalSigners = { schemaVersion: 1, status: 'APPROVED', keys: [{ keyId: 'release-key-1', status: 'ACTIVE', publicKeyPem: signingKey.publicKey.export({ type: 'spki', format: 'pem' }).toString() }] };
const trustedApprovalSignerRegistrySha256 = artifactSha256(trustedApprovalSigners);
const signed = <T extends Record<string, unknown>>(record: T) => ({ ...record, signerKeyId: 'release-key-1', signature: sign(null, Buffer.from(signableApprovalRecord(record)), signingKey.privateKey).toString('base64') });
const readJson = (path: string) => JSON.parse(readFileSync(resolve(path), 'utf8')) as Record<string, any>;
function fixture() {
  const approval = { status: 'APPROVED', approvalDecisionId: 'decision-1', approvedBy: 'owner', approvedAt };
  const catalog: any = { ...readJson('config/pet-catalog.v1.json'), ...approval };
  const economy: any = { ...readJson('config/economy.v1.json'), ...approval, catalogRevision: catalog.catalogRevision, catalogHash: catalog.catalogHash };
  const dailyPetLoop: any = { ...readJson('config/daily-pet-loop.v1.json'), ...approval };
  const weeklyCompetition: any = { ...readJson('config/weekly-competition.v1.json'), ...approval };
  const entries = catalog.entries.map((catalogEntry: { petId: string }, index: number) => {
    const sourceSha256 = (index + 1).toString(16).padStart(64, '0');
    const thumbnailSha256 = (index + 1001).toString(16).padStart(64, '0');
    const fullSha256 = (index + 2001).toString(16).padStart(64, '0');
    return { petId: catalogEntry.petId, sourceFile: `pet-${index}.png`, sourceSha256, thumbnailSha256, fullSha256,
      thumbnailFile: `content/pets/runtime/${thumbnailSha256}-thumb.webp`, fullFile: `content/pets/runtime/${fullSha256}-full.webp`,
      thumbnailUrl: `https://cdn.example/${thumbnailSha256}/thumb.webp`, fullUrl: `https://cdn.example/${fullSha256}/full.webp`,
      rights: { evidenceId: `rights-${index}`, approvedBy: 'rights-owner', approvedAt },
      visual: { reviewId: `visual-${index}`, approvedBy: 'art-owner', approvedAt, smallCardApproved: true, cropApproved: true, backgroundApproved: true } };
  });
  const petRuntimeArt = { schemaVersion: 1, ...approval, catalogRevision: catalog.catalogRevision, catalogHash: catalog.catalogHash, entries };
  const sourceManifest = { schemaVersion: 1, admissions: entries.map((entry: any, index: number) => ({ fileName: entry.sourceFile, sourceSha256: entry.sourceSha256,
    normalizedSlug: `pet-${index}`, candidateRarity: 'COMMON', familySlug: null, provenanceNote: 'approved test fixture', coachArchetype: 'SCOUT', width: 1, height: 1, pixelFormat: 'RGBA',
    rightsStatus: 'APPROVED', visualReview: 'APPROVED', backgroundReview: 'APPROVED', cropReview: 'APPROVED' })) };
  const rightsEvidence = { schemaVersion: 1, status: 'APPROVED', entries: entries.map((entry: any, index: number) => ({
    rightsEvidenceId: entry.rights.evidenceId, sourceSha256: entry.sourceSha256, basis: 'OWNED', provenanceReference: `provenance-${index}`,
    permissionReference: `permission-${index}`, takedownOwnerKey: 'legal-ops', status: 'APPROVED', reviewedBy: 'rights-owner', reviewedAt: approvedAt,
  })) };
  const binding = (path: string, artifact: unknown) => ({ path, sha256: artifactSha256(artifact) });
  const approvalRecords = [
    { approvalGroup: 'PET_ECONOMY_V1', decisionId: 'decision-1', approvedBy: 'owner', approvedAt, artifacts: [binding('config/economy.v1.json', economy), binding('config/pet-catalog.v1.json', catalog)] },
    { approvalGroup: 'DAILY_PET_LOOP_V1', decisionId: 'decision-1', approvedBy: 'owner', approvedAt, artifacts: [binding('config/daily-pet-loop.v1.json', dailyPetLoop)] },
    { approvalGroup: 'WEEKLY_COMPETITION_V1', decisionId: 'decision-1', approvedBy: 'owner', approvedAt, artifacts: [binding('config/weekly-competition.v1.json', weeklyCompetition)] },
    { approvalGroup: 'PET_RUNTIME_ART_V1', decisionId: 'decision-1', approvedBy: 'owner', approvedAt, artifacts: [binding('config/pet-runtime-art.v1.json', petRuntimeArt), binding('content/pets/source-manifest.v1.json', sourceManifest), binding('config/pet-rights-evidence.v1.json', rightsEvidence)] },
  ].map(signed);
  const assetFileHashes = Object.fromEntries(entries.flatMap((entry: any) => [[entry.thumbnailFile, entry.thumbnailSha256], [entry.fullFile, entry.fullSha256]]));
  return { economy, catalog, dailyPetLoop, weeklyCompetition, petRuntimeArt, sourceManifest, rightsEvidence, approvalRecords, trustedApprovalSigners, trustedApprovalSignerRegistrySha256, assetFileHashes };
}

describe('pet runtime approval checker', () => {
  it('accepts an exact signed, reviewed, HTTPS one-to-one mapping', () => expect(evaluatePetRuntimeApproval(fixture())).toEqual({ status: 'APPROVED', blockers: [] }));
  it.each([
    ['missing signature', (x: any) => { x.approvalRecords = []; }, 'APPROVAL_RECORD_MISSING'],
    ['forged signature', (x: any) => { x.approvalRecords[0].signature = Buffer.from('forged').toString('base64'); }, 'APPROVAL_SIGNATURE_INVALID'],
    ['unpinned signer registry', (x: any) => { x.trustedApprovalSignerRegistrySha256 = 'f'.repeat(64); }, 'APPROVAL_SIGNATURE_INVALID'],
    ['test reviewer', (x: any) => { x.petRuntimeArt.approvedBy = 'test-owner'; }, 'TEST_OR_MISSING_APPROVER'],
    ['whitespace-prefixed test reviewer', (x: any) => { x.petRuntimeArt.approvedBy = ' test-owner'; }, 'TEST_OR_MISSING_APPROVER'],
    ['trailing reviewer whitespace', (x: any) => { x.petRuntimeArt.approvedBy = 'owner '; }, 'TEST_OR_MISSING_APPROVER'],
    ['noncanonical time', (x: any) => { x.petRuntimeArt.approvedAt = '2026-08-11T09:30:00Z'; }, 'NONCANONICAL_APPROVAL_TIME'],
    ['stale catalog', (x: any) => { x.petRuntimeArt.catalogHash = 'd'.repeat(64); }, 'STALE_ART_CATALOG_BINDING'],
    ['HTTP URL', (x: any) => { x.petRuntimeArt.entries[0].thumbnailUrl = 'http://cdn.example/pet.webp'; }, 'INSECURE_ASSET_URL'],
    ['unverified asset bytes', (x: any) => { delete x.assetFileHashes[x.petRuntimeArt.entries[0].thumbnailFile]; }, 'ASSET_BYTES_UNVERIFIED'],
    ['pending source', (x: any) => { x.sourceManifest.admissions[0].rightsStatus = 'PENDING'; }, 'SOURCE_REVIEW_PENDING'],
    ['missing takedown owner', (x: any) => { x.rightsEvidence.entries[0].takedownOwnerKey = ''; }, 'RIGHTS_EVIDENCE_SCHEMA_INVALID'],
    ['stale rights evidence', (x: any) => { x.rightsEvidence.entries[0].permissionReference = 'changed'; }, 'STALE_RIGHTS_EVIDENCE_HASH'],
    ['missing active pet', (x: any) => { x.petRuntimeArt.entries = []; }, 'ACTIVE_PET_ART_MISSING'],
    ['unknown art field', (x: any) => { x.petRuntimeArt.entries[0].unreviewed = true; }, 'ART_SCHEMA_INVALID'],
    ['stale signed hash', (x: any) => { x.economy.changed = true; }, 'STALE_ARTIFACT_HASH'],
    ['stale source manifest hash', (x: any) => { x.sourceManifest.admissions[0].cropReview = 'REJECTED'; }, 'STALE_SOURCE_MANIFEST_HASH'],
    ['duplicate pet ID', (x: any) => { x.petRuntimeArt.entries.push(structuredClone(x.petRuntimeArt.entries[0])); }, 'DUPLICATE_PET_ID'],
    ['duplicate source file', (x: any) => { const copy = structuredClone(x.petRuntimeArt.entries[0]); copy.petId = 'd37cacc3-0a78-4a4a-bcb7-58fbaa7b918e'; x.catalog.entries.push({ petId: copy.petId }); x.petRuntimeArt.entries.push(copy); }, 'DUPLICATE_SOURCE_FILE'],
  ])('blocks %s', (_name, mutate, code) => { const value = fixture(); mutate(value); expect(evaluatePetRuntimeApproval(value).blockers.some((item) => item.code === code)).toBe(true); });
});
