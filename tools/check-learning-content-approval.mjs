import { createHash, verify as verifySignature } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { artifactSha256, signableApprovalRecord } from './check-pet-runtime-approval.mjs';

const hash = /^[0-9a-f]{64}$/;
const canonicalTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const APPROVAL_GROUP = 'LEARNING_CONTENT_V1';

function productionText(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim() && !/^test-/i.test(value);
}

function validTime(value) {
  return typeof value === 'string' && canonicalTime.test(value) && new Date(value).toISOString() === value;
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function circle(value) {
  return value && typeof value.cx === 'number' && typeof value.cy === 'number' && typeof value.r === 'number'
    && value.cx >= 0 && value.cx <= 1 && value.cy >= 0 && value.cy <= 1 && value.r > 0 && value.r <= 1;
}

export function buildCasualLearningPack(root, key, inventoryEntry, draft, derived, hunts, approvedAt) {
  const publicContent = draft.publicContent;
  const differences = (derived?.differences ?? []).map((difference, index) => ({
    objectiveId: difference.id,
    tier: index === derived.differences.length - 1 && derived.differences.length > 1 ? 'HARD' : 'NORMAL',
    hitboxes: {
      imageA: { cx: difference.cx, cy: difference.cy, r: difference.r },
      imageB: { cx: difference.cx, cy: difference.cy, r: difference.r },
    },
  }));
  const first = differences[0];
  const wordHunts = (hunts ?? []).map((hunt) => ({
    missionId: hunt.missionId,
    kind: hunt.kind,
    publicPrompt: hunt.publicPrompt,
    hitboxes: {
      imageA: { cx: hunt.cx, cy: hunt.cy, r: hunt.r },
      imageB: { cx: hunt.cx, cy: hunt.cy, r: hunt.r },
    },
  }));
  const privateSolution = {
    contentRevisionId: publicContent.contentRevisionId,
    schemaVersion: draft.privateSolution.schemaVersion,
    differences,
    wordHunts,
    suddenDeath: first === undefined ? draft.privateSolution.suddenDeath : {
      objectiveId: first.objectiveId,
      hitboxes: first.hitboxes,
    },
    finalChallenge: draft.privateSolution.finalChallenge,
  };
  const imageA = publicContent.imageA.sha256;
  const imageB = publicContent.imageB.sha256;
  const rightsManifest = {
    schemaVersion: '1.0.0',
    manifestSetId: `casual-${key}`,
    entries: [
      rightsEntry(`${key}-a`, imageA, `content/learning/source/${key}-a.png`, approvedAt),
      rightsEntry(`${key}-b`, imageB, `content/learning/source/${key}-b.png`, approvedAt),
    ].sort((left, right) => left.assetSha256.localeCompare(right.assetSha256)),
  };
  return {
    key,
    contentId: publicContent.contentId,
    contentRevisionId: publicContent.contentRevisionId,
    category: inventoryEntry.category,
    publicContent,
    privateSolution,
    rightsManifest,
    sourceFiles: [`content/learning/source/${key}-a.png`, `content/learning/source/${key}-b.png`],
  };
}

function rightsEntry(id, assetSha256, sourceUri, approvedAt) {
  return {
    rightsRecordId: `rights-${id}`,
    assetSha256,
    source: { kind: 'OWNED', sourceRecordId: `source-${id}`, sourceUri },
    generator: {
      provider: 'xAI',
      model: 'Imagine',
      modelVersion: 'closed-beta-2026-08-24',
      termsVersion: 'PRODUCT_OWNER_CLOSED_BETA_ADMISSION_V1',
      generatedAt: approvedAt,
    },
    prompt: { available: false, sha256: null, unavailabilityReason: 'BOUND_IN_REPO_PROMPT_EVIDENCE' },
    rights: {
      status: 'APPROVED',
      licenseOrPermission: 'PRODUCT_OWNER_CLOSED_BETA_ADMISSION_V1',
      approverId: 'product-owner',
      approvedAt,
    },
    education: {
      status: 'APPROVED',
      reviewerId: 'product-owner',
      reviewedAt: approvedAt,
    },
    takedown: {
      ownerId: 'product-owner',
      contact: 'product-owner',
      runbookVersion: '1.0.0',
    },
  };
}

function recordSignatureIsTrusted(record, signers, registrySha256) {
  try {
    if (signers?.status !== 'APPROVED' || !hash.test(registrySha256 ?? '') || artifactSha256(signers) !== registrySha256) {
      return false;
    }
    const key = signers.keys?.find((item) => item.keyId === record.signerKeyId && item.status === 'ACTIVE');
    return Boolean(key && verifySignature(null, Buffer.from(signableApprovalRecord(record)), key.publicKeyPem, Buffer.from(record.signature, 'base64')));
  } catch {
    return false;
  }
}

export function evaluateLearningContentApproval(input) {
  const blockers = [];
  const add = (code, detail) => blockers.push({ code, detail });
  const { inventory, approvalRecord, trustedApprovalSigners, trustedApprovalSignerRegistrySha256, packs, root } = input;
  const admit = new Set((inventory?.entries ?? []).filter((entry) => entry.decision === 'ADMIT').map((entry) => entry.key));

  if (!approvalRecord || approvalRecord.approvalGroup !== APPROVAL_GROUP) add('APPROVAL_RECORD_MISSING', 'LEARNING_CONTENT_V1');
  if (!productionText(approvalRecord?.decisionId) || !productionText(approvalRecord?.approvedBy) || !productionText(approvalRecord?.signerKeyId)) {
    add('TEST_OR_MISSING_APPROVER', approvalRecord?.approvedBy ?? '');
  }
  if (!validTime(approvalRecord?.approvedAt)) add('NONCANONICAL_APPROVAL_TIME', approvalRecord?.approvedAt ?? '');
  if (!recordSignatureIsTrusted(approvalRecord, trustedApprovalSigners, trustedApprovalSignerRegistrySha256)) {
    add('APPROVAL_SIGNATURE_INVALID', approvalRecord?.signerKeyId ?? '');
  }
  if (!Array.isArray(approvalRecord?.artifacts) || approvalRecord.artifacts.length === 0) add('APPROVAL_RECORD_MISSING', 'artifacts');

  const seenHashes = new Set();
  for (const pack of packs ?? []) {
    if (!admit.has(pack.key)) add('PACK_NOT_ADMITTED', pack.key);
    const binding = approvalRecord?.artifacts?.find((item) => item?.path === `content/learning/approvals/${pack.key}.v1.json`);
    if (!binding || binding.sha256 !== artifactSha256(pack)) add('STALE_ARTIFACT_HASH', pack.key);
    const imageA = pack.publicContent?.imageA;
    const imageB = pack.publicContent?.imageB;
    if (!hash.test(imageA?.sha256 ?? '') || !hash.test(imageB?.sha256 ?? '') || imageA.sha256 === imageB.sha256) {
      add('ASSET_HASH_INVALID', pack.key);
    }
    if (seenHashes.has(imageA?.sha256) || seenHashes.has(imageB?.sha256)) add('DUPLICATE_ASSET_HASH', pack.key);
    seenHashes.add(imageA?.sha256);
    seenHashes.add(imageB?.sha256);
    if (typeof imageA?.url === 'string' && imageA.url.startsWith('http://')) add('INSECURE_ASSET_URL', pack.key);
    if (typeof imageB?.url === 'string' && imageB.url.startsWith('http://')) add('INSECURE_ASSET_URL', pack.key);
    if (root) {
      const fileA = resolve(root, `content/learning/source/${pack.key}-a.png`);
      const fileB = resolve(root, `content/learning/source/${pack.key}-b.png`);
      try {
        if (sha256File(fileA) !== imageA.sha256 || sha256File(fileB) !== imageB.sha256) add('ASSET_BYTES_UNVERIFIED', pack.key);
      } catch {
        add('ASSET_BYTES_UNVERIFIED', pack.key);
      }
    }
    const diffs = pack.privateSolution?.differences ?? [];
    if (!Array.isArray(diffs) || diffs.length < 1) add('DERIVED_HITBOXES_MISSING', pack.key);
    for (const difference of diffs) {
      if (!circle(difference?.hitboxes?.imageA) || !circle(difference?.hitboxes?.imageB)) add('DERIVED_HITBOXES_MISSING', pack.key);
    }
    const rights = pack.rightsManifest?.entries ?? [];
    const rightsHashes = rights.map((entry) => entry.assetSha256).sort().join(',');
    const publicHashes = [imageA?.sha256, imageB?.sha256].sort().join(',');
    if (rights.length !== 2 || rightsHashes !== publicHashes) add('RIGHTS_ASSET_BIJECTION', pack.key);
    for (const entry of rights) {
      if (entry.rights?.status !== 'APPROVED' || entry.education?.status !== 'APPROVED') add('RIGHTS_APPROVAL_REQUIRED', pack.key);
      if (!productionText(entry.rights?.approverId) || !productionText(entry.education?.reviewerId)) add('TEST_OR_MISSING_APPROVER', pack.key);
    }
    if (!pack.privateSolution?.finalChallenge?.canonicalAnswer) add('FINAL_CHALLENGE_MISSING', pack.key);
    if (pack.category !== 'ENGLISH' && pack.category !== 'PROVERB') add('CATEGORY_NOT_CASUAL', pack.key);
  }

  return { status: blockers.length === 0 ? 'APPROVED' : 'BLOCKED', blockers };
}

export { APPROVAL_GROUP };
