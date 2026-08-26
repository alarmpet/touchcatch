import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  artifactSha256,
  signableApprovalRecord,
} from '../check-pet-runtime-approval.mjs';
import {
  APPROVAL_GROUP,
  buildCasualLearningPack,
  evaluateLearningContentApproval,
} from '../check-learning-content-approval.mjs';

const approvedAt = '2026-08-24T15:00:00.000Z';
const signingKey = generateKeyPairSync('ed25519');
const trustedApprovalSigners = {
  schemaVersion: 1,
  status: 'APPROVED',
  keys: [{
    keyId: 'content-key-1',
    status: 'ACTIVE',
    publicKeyPem: signingKey.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }],
};
const trustedApprovalSignerRegistrySha256 = artifactSha256(trustedApprovalSigners);

function packFixture() {
  const draft = {
    privateSolution: {
      schemaVersion: '1.0.0',
      suddenDeath: { objectiveId: 'sudden_1', hitboxes: { imageA: { cx: 0.2, cy: 0.2, r: 0.05 }, imageB: { cx: 0.2, cy: 0.2, r: 0.05 } } },
      finalChallenge: { canonicalAnswer: 'resilience', aliases: [], hintUnits: ['r'] },
    },
    publicContent: {
      contentId: 'a913582e-ad85-4687-8d07-0891a60cc415',
      contentRevisionId: 'a0daa245-1ed6-4816-8b59-3ed4d5a23daf',
      imageA: { sha256: 'aa'.repeat(32), url: `https://cdn.spot-learn.test/assets/${'aa'.repeat(32)}.png` },
      imageB: { sha256: 'bb'.repeat(32), url: `https://cdn.spot-learn.test/assets/${'bb'.repeat(32)}.png` },
    },
  };
  const derived = { usable: true, differences: [{ id: 'derived-1', cx: 0.1, cy: 0.2, r: 0.08 }] };
  return buildCasualLearningPack(
    '.',
    'en-resilience',
    { key: 'en-resilience', category: 'ENGLISH', decision: 'ADMIT' },
    draft,
    derived,
    [],
    approvedAt,
  );
}

function signedRecord(pack: ReturnType<typeof packFixture>) {
  const record = {
    approvalGroup: APPROVAL_GROUP,
    decisionId: 'android-casual-content-2026-08-24',
    approvedBy: 'product-owner',
    approvedAt,
    artifacts: [{ path: 'content/learning/approvals/en-resilience.v1.json', sha256: artifactSha256(pack) }],
  };
  return {
    ...record,
    signerKeyId: 'content-key-1',
    signature: sign(null, Buffer.from(signableApprovalRecord(record)), signingKey.privateKey).toString('base64'),
  };
}

function inventory() {
  return { entries: [{ key: 'en-resilience', decision: 'ADMIT', category: 'ENGLISH' }] };
}

describe('learning content approval', () => {
  it('accepts a signed ADMIT pack with product-owner rights and derived hitboxes', () => {
    const pack = packFixture();
    expect(evaluateLearningContentApproval({
      inventory: inventory(),
      approvalRecord: signedRecord(pack),
      trustedApprovalSigners,
      trustedApprovalSignerRegistrySha256,
      packs: [pack],
    })).toEqual({ status: 'APPROVED', blockers: [] });
  });

  it.each([
    ['unsigned', (input: { approvalRecord: { signature: string } }) => { input.approvalRecord.signature = Buffer.from('forged').toString('base64'); }, 'APPROVAL_SIGNATURE_INVALID'],
    ['test approver', (input: { approvalRecord: { approvedBy: string } }) => { input.approvalRecord.approvedBy = 'test-owner'; }, 'TEST_OR_MISSING_APPROVER'],
    ['stale hash', (input: { packs: Array<{ publicContent: { theme?: string } }> }) => { input.packs[0]!.publicContent.theme = 'changed'; }, 'STALE_ARTIFACT_HASH'],
    ['hold pack', (input: { inventory: { entries: Array<{ decision: string }> } }) => { input.inventory.entries[0]!.decision = 'HOLD'; }, 'PACK_NOT_ADMITTED'],
    ['http url', (input: { packs: Array<{ publicContent: { imageA: { url: string } } }> }) => { input.packs[0]!.publicContent.imageA.url = 'http://cdn.spot-learn.test/assets/x.png'; }, 'INSECURE_ASSET_URL'],
    ['duplicate assets', (input: { packs: Array<{ publicContent: { imageA: { sha256: string }; imageB: { sha256: string } } }> }) => { input.packs[0]!.publicContent.imageB.sha256 = input.packs[0]!.publicContent.imageA.sha256; }, 'ASSET_HASH_INVALID'],
  ])('blocks %s', (_name, mutate, code) => {
    const pack = packFixture();
    const input = {
      inventory: inventory(),
      approvalRecord: signedRecord(pack),
      trustedApprovalSigners,
      trustedApprovalSignerRegistrySha256,
      packs: [pack],
    };
    mutate(input);
    expect(evaluateLearningContentApproval(input).blockers.some((item) => item.code === code)).toBe(true);
  });

  it('keeps casual-season SQL from requiring a selected pet', () => {
    const sql = readFileSync('supabase/migrations/202608240001_casual_learning_season.sql', 'utf8');
    expect(sql).toContain('create_casual_season_v1');
    expect(sql).toContain('publish_casual_learning_revision_v1');
    expect(sql).toContain('alter column selected_user_pet_id drop not null');
    expect(sql).not.toMatch(/message = 'SELECTED_PET_REQUIRED'/);
  });

  it('accepts the committed Android casual-beta English ADMIT approval when present', () => {
    let approvalRecord: unknown;
    let signers: unknown;
    let inventoryDoc: { entries: Array<{ key: string; decision: string }> };
    try {
      approvalRecord = JSON.parse(readFileSync('docs/approvals/learning-content-v1-approval.json', 'utf8'));
      signers = JSON.parse(readFileSync('config/trusted-approval-signers.v1.json', 'utf8'));
      inventoryDoc = JSON.parse(readFileSync('content/learning/inventory.v1.json', 'utf8'));
    } catch {
      return;
    }
    const artifacts = (approvalRecord as { artifacts: Array<{ path: string }> }).artifacts;
    const packs = artifacts.map((artifact) => JSON.parse(readFileSync(artifact.path, 'utf8')));
    expect(evaluateLearningContentApproval({
      inventory: inventoryDoc,
      approvalRecord,
      trustedApprovalSigners: signers,
      trustedApprovalSignerRegistrySha256: artifactSha256(signers),
      packs,
      root: process.cwd(),
    }).status).toBe('APPROVED');
    expect(packs).toHaveLength(5);
    expect(packs.every((pack: { category: string }) => pack.category === 'ENGLISH')).toBe(true);
  });
});
