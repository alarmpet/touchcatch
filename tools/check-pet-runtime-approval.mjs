import { createHash, verify as verifySignature } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';

const runtimeArtSchema = JSON.parse(readFileSync(new URL('../schemas/pet-runtime-art.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });
const validateRuntimeArt = ajv.compile(runtimeArtSchema);
const validateSourceManifest = ajv.compile(JSON.parse(readFileSync(new URL('../content/pets/source-manifest.schema.json', import.meta.url), 'utf8')));
const validateRightsEvidence = ajv.compile(JSON.parse(readFileSync(new URL('../schemas/pet-rights-evidence.schema.json', import.meta.url), 'utf8')));
const policyValidators = Object.fromEntries([
  ['economy', 'economy.schema.json'], ['catalog', 'pet-catalog.schema.json'],
  ['dailyPetLoop', 'daily-pet-loop.schema.json'], ['weeklyCompetition', 'weekly-competition.schema.json'],
].map(([key, file]) => [key, ajv.compile(JSON.parse(readFileSync(new URL(`../schemas/${file}`, import.meta.url), 'utf8')))]));

const canonicalTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const hash = /^[0-9a-f]{64}$/;

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function artifactSha256(value) {
  return createHash('sha256').update(stable(value)).digest('hex');
}

export function signableApprovalRecord(record) {
  return stable({ approvalGroup: record.approvalGroup, decisionId: record.decisionId, approvedBy: record.approvedBy, approvedAt: record.approvedAt, artifacts: record.artifacts });
}

function recordSignatureIsTrusted(record, input) {
  try {
    if (input.trustedApprovalSigners?.status !== 'APPROVED'
      || !hash.test(input.trustedApprovalSignerRegistrySha256 ?? '')
      || artifactSha256(input.trustedApprovalSigners) !== input.trustedApprovalSignerRegistrySha256) return false;
    const key = input.trustedApprovalSigners?.keys?.find((item) => item.keyId === record.signerKeyId && item.status === 'ACTIVE');
    return key && verifySignature(null, Buffer.from(signableApprovalRecord(record)), key.publicKeyPem, Buffer.from(record.signature, 'base64'));
  } catch { return false; }
}

function productionText(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim() && !/^test-/i.test(value);
}

function validTime(value) {
  return typeof value === 'string' && canonicalTime.test(value) && new Date(value).toISOString() === value;
}

const groupSpecs = {
  PET_ECONOMY_V1: [['config/economy.v1.json', 'economy'], ['config/pet-catalog.v1.json', 'catalog']],
  DAILY_PET_LOOP_V1: [['config/daily-pet-loop.v1.json', 'dailyPetLoop']],
  WEEKLY_COMPETITION_V1: [['config/weekly-competition.v1.json', 'weeklyCompetition']],
  PET_RUNTIME_ART_V1: [['config/pet-runtime-art.v1.json', 'petRuntimeArt']],
};

export function approvalGroupIsVerified(input, approvalGroup) {
  if (input.trustedApprovalSigners?.status !== 'APPROVED'
    || !hash.test(input.trustedApprovalSignerRegistrySha256 ?? '')
    || artifactSha256(input.trustedApprovalSigners) !== input.trustedApprovalSignerRegistrySha256) return false;
  const specs = groupSpecs[approvalGroup];
  if (!specs) return false;
  for (const [path, key] of specs) {
    const artifact = input[key];
    if (!artifact || artifact.status !== 'APPROVED' || !productionText(artifact.approvalDecisionId)
      || !productionText(artifact.approvedBy) || !validTime(artifact.approvedAt)) return false;
    const record = (input.approvalRecords ?? []).find((item) => item?.approvalGroup === approvalGroup && item?.decisionId === artifact.approvalDecisionId);
    if (!record || !productionText(record.approvedBy) || !productionText(record.signerKeyId) || !productionText(record.signature) || !recordSignatureIsTrusted(record, input)
      || !validTime(record.approvedAt) || record.approvedAt !== artifact.approvedAt || record.approvedBy !== artifact.approvedBy) return false;
    const binding = Array.isArray(record.artifacts) ? record.artifacts.find((item) => item?.path === path) : undefined;
    if (!binding || binding.sha256 !== artifactSha256(artifact)) return false;
    if (approvalGroup === 'PET_RUNTIME_ART_V1') {
      const sourceBinding = record.artifacts.find((item) => item?.path === 'content/pets/source-manifest.v1.json');
      if (!sourceBinding || sourceBinding.sha256 !== artifactSha256(input.sourceManifest)) return false;
      const rightsBinding = record.artifacts.find((item) => item?.path === 'config/pet-rights-evidence.v1.json');
      if (!rightsBinding || rightsBinding.sha256 !== artifactSha256(input.rightsEvidence)) return false;
    }
  }
  return true;
}

export function runtimeArtSourcesAreApproved(input) {
  if (!validateSourceManifest(input.sourceManifest)) return false;
  const sources = new Map((input.sourceManifest?.admissions ?? []).map((entry) => [`${entry.fileName}\0${entry.sourceSha256}`, entry]));
  return (input.petRuntimeArt?.entries ?? []).every((entry) => {
    const source = sources.get(`${entry.sourceFile}\0${entry.sourceSha256}`);
    return source && [source.rightsStatus, source.visualReview, source.backgroundReview, source.cropReview].every((status) => status === 'APPROVED');
  });
}

export function runtimeArtAssetsAreVerified(input) {
  return (input.petRuntimeArt?.entries ?? []).every((entry) => input.assetFileHashes?.[entry.thumbnailFile] === entry.thumbnailSha256
    && input.assetFileHashes?.[entry.fullFile] === entry.fullSha256);
}

export function runtimeArtRightsEvidenceIsApproved(input) {
  if (!validateRightsEvidence(input.rightsEvidence) || input.rightsEvidence.status !== 'APPROVED') return false;
  const evidence = new Map(input.rightsEvidence.entries.map((entry) => [entry.rightsEvidenceId, entry]));
  return (input.petRuntimeArt?.entries ?? []).every((entry) => {
    const item = evidence.get(entry.rights?.evidenceId);
    return item && item.sourceSha256 === entry.sourceSha256 && item.status === 'APPROVED'
      && productionText(item.provenanceReference) && productionText(item.permissionReference)
      && productionText(item.takedownOwnerKey) && productionText(item.reviewedBy) && validTime(item.reviewedAt);
  });
}

export function evaluatePetRuntimeApproval(input) {
  const blockers = [];
  const add = (code, detail) => blockers.push({ code, detail });
  if (!validateRuntimeArt(input.petRuntimeArt)) {
    add('ART_SCHEMA_INVALID', validateRuntimeArt.errors?.map((error) => `${error.instancePath} ${error.message}`).join('; ') ?? 'unknown schema error');
  }
  if (!validateSourceManifest(input.sourceManifest)) add('SOURCE_MANIFEST_SCHEMA_INVALID', 'content/pets/source-manifest.v1.json');
  if (!validateRightsEvidence(input.rightsEvidence)) add('RIGHTS_EVIDENCE_SCHEMA_INVALID', 'config/pet-rights-evidence.v1.json');
  for (const [key, validate] of Object.entries(policyValidators)) {
    if (!validate(input[key])) add('POLICY_SCHEMA_INVALID', key);
  }
  if (input.catalog && artifactSha256({ schemaVersion: input.catalog.schemaVersion, catalogRevision: input.catalog.catalogRevision, entries: input.catalog.entries }) !== input.catalog.catalogHash) {
    add('CATALOG_INTERNAL_HASH_MISMATCH', 'config/pet-catalog.v1.json');
  }
  if (input.economy?.pitySemantics && artifactSha256(input.economy.pitySemantics) !== input.economy.pitySemanticsHash) {
    add('ECONOMY_INTERNAL_HASH_MISMATCH', 'config/economy.v1.json');
  }
  const artifacts = [
    ['config/economy.v1.json', input.economy, 'PET_ECONOMY_V1'],
    ['config/pet-catalog.v1.json', input.catalog, 'PET_ECONOMY_V1'],
    ['config/daily-pet-loop.v1.json', input.dailyPetLoop, 'DAILY_PET_LOOP_V1'],
    ['config/weekly-competition.v1.json', input.weeklyCompetition, 'WEEKLY_COMPETITION_V1'],
    ['config/pet-runtime-art.v1.json', input.petRuntimeArt, 'PET_RUNTIME_ART_V1'],
  ];

  for (const [path, artifact, approvalGroup] of artifacts) {
    if (!artifact || artifact.status !== 'APPROVED') add('ARTIFACT_NOT_APPROVED', path);
    else {
      if (!productionText(artifact.approvalDecisionId) || !productionText(artifact.approvedBy)) add('TEST_OR_MISSING_APPROVER', path);
      if (!validTime(artifact.approvedAt)) add('NONCANONICAL_APPROVAL_TIME', path);
      const record = (input.approvalRecords ?? []).find((item) => item?.approvalGroup === approvalGroup && item?.decisionId === artifact.approvalDecisionId);
      if (!record) add('APPROVAL_RECORD_MISSING', path);
      else {
        if (!productionText(record.approvedBy) || !productionText(record.signerKeyId) || !productionText(record.signature) || !recordSignatureIsTrusted(record, input)) add('APPROVAL_SIGNATURE_INVALID', path);
        if (!validTime(record.approvedAt) || record.approvedAt !== artifact.approvedAt || record.approvedBy !== artifact.approvedBy) add('APPROVAL_RECORD_MISMATCH', path);
        const binding = Array.isArray(record.artifacts) ? record.artifacts.find((item) => item?.path === path) : undefined;
        if (!binding || binding.sha256 !== artifactSha256(artifact)) add('STALE_ARTIFACT_HASH', path);
        if (approvalGroup === 'PET_RUNTIME_ART_V1') {
          const sourceBinding = Array.isArray(record.artifacts) ? record.artifacts.find((item) => item?.path === 'content/pets/source-manifest.v1.json') : undefined;
          if (!sourceBinding || sourceBinding.sha256 !== artifactSha256(input.sourceManifest)) add('STALE_SOURCE_MANIFEST_HASH', path);
          const rightsBinding = Array.isArray(record.artifacts) ? record.artifacts.find((item) => item?.path === 'config/pet-rights-evidence.v1.json') : undefined;
          if (!rightsBinding || rightsBinding.sha256 !== artifactSha256(input.rightsEvidence)) add('STALE_RIGHTS_EVIDENCE_HASH', path);
        }
      }
    }
  }

  const catalog = input.catalog ?? {};
  const art = input.petRuntimeArt ?? {};
  if (art.catalogRevision !== catalog.catalogRevision || art.catalogHash !== catalog.catalogHash) add('STALE_ART_CATALOG_BINDING', 'catalog revision/hash mismatch');
  const catalogIds = new Set(Array.isArray(catalog.entries) ? catalog.entries.map((entry) => entry.petId) : []);
  const ids = new Set(); const files = new Set(); const sourceHashes = new Set(); const runtimeHashes = new Set();
  const sources = new Map((input.sourceManifest?.admissions ?? []).map((entry) => [`${entry.fileName}\0${entry.sourceSha256}`, entry]));
  for (const entry of art.entries ?? []) {
    if (ids.has(entry.petId)) add('DUPLICATE_PET_ID', entry.petId); else ids.add(entry.petId);
    if (files.has(entry.sourceFile)) add('DUPLICATE_SOURCE_FILE', entry.sourceFile); else files.add(entry.sourceFile);
    if (sourceHashes.has(entry.sourceSha256)) add('DUPLICATE_SOURCE_HASH', entry.sourceSha256); else sourceHashes.add(entry.sourceSha256);
    for (const runtimeHash of [entry.thumbnailSha256, entry.fullSha256]) {
      if (runtimeHashes.has(runtimeHash)) add('DUPLICATE_ASSET_HASH', runtimeHash); else runtimeHashes.add(runtimeHash);
    }
    if (!hash.test(entry.sourceSha256 ?? '') || !hash.test(entry.thumbnailSha256 ?? '') || !hash.test(entry.fullSha256 ?? '')) add('INVALID_ASSET_HASH', entry.petId);
    if (input.assetFileHashes?.[entry.thumbnailFile] !== entry.thumbnailSha256 || input.assetFileHashes?.[entry.fullFile] !== entry.fullSha256) add('ASSET_BYTES_UNVERIFIED', entry.petId);
    if (!String(entry.thumbnailUrl ?? '').startsWith('https://') || !String(entry.fullUrl ?? '').startsWith('https://')) add('INSECURE_ASSET_URL', entry.petId);
    if (!String(entry.thumbnailUrl ?? '').includes(entry.thumbnailSha256 ?? '') || !String(entry.fullUrl ?? '').includes(entry.fullSha256 ?? '')) add('NON_CONTENT_ADDRESSED_ASSET_URL', entry.petId);
    const source = sources.get(`${entry.sourceFile}\0${entry.sourceSha256}`);
    if (!source) add('SOURCE_EVIDENCE_MISSING', entry.petId);
    else if ([source.rightsStatus, source.visualReview, source.backgroundReview, source.cropReview].some((status) => status !== 'APPROVED')) add('SOURCE_REVIEW_PENDING', entry.petId);
    if (!productionText(entry.rights?.evidenceId) || !productionText(entry.rights?.approvedBy) || !validTime(entry.rights?.approvedAt)) add('RIGHTS_APPROVAL_INVALID', entry.petId);
    if (!productionText(entry.visual?.reviewId) || !productionText(entry.visual?.approvedBy) || !validTime(entry.visual?.approvedAt)
      || entry.visual?.smallCardApproved !== true || entry.visual?.cropApproved !== true || entry.visual?.backgroundApproved !== true) add('VISUAL_APPROVAL_INVALID', entry.petId);
  }
  for (const petId of catalogIds) if (!ids.has(petId)) add('ACTIVE_PET_ART_MISSING', petId);
  for (const petId of ids) if (!catalogIds.has(petId)) add('UNKNOWN_PET_ART', petId);
  if (!runtimeArtRightsEvidenceIsApproved(input)) add('RIGHTS_EVIDENCE_NOT_APPROVED', 'config/pet-rights-evidence.v1.json');
  return { status: blockers.length === 0 ? 'APPROVED' : 'BLOCKED', blockers };
}

function readJson(path) { return JSON.parse(readFileSync(resolve(path), 'utf8')); }

export function evaluateRepository(root = process.cwd()) {
  const fromRoot = (path) => readJson(resolve(root, path));
  const approvalsDir = resolve(root, 'docs/approvals');
  const approvalFiles = [
    'pet-economy-v1-approval.json', 'daily-pet-loop-v1-approval.json',
    'weekly-competition-v1-approval.json', 'pet-runtime-art-v1-approval.json',
  ];
  const petRuntimeArt = fromRoot('config/pet-runtime-art.v1.json');
  const runtimeAssetRoot = resolve(root, 'content/pets/runtime');
  const assetFileHashes = Object.fromEntries((petRuntimeArt.entries ?? []).flatMap((entry) => [entry.thumbnailFile, entry.fullFile].map((path) => {
    const absolute = typeof path === 'string' ? resolve(root, path) : '';
    const insideRuntimeRoot = absolute.startsWith(`${runtimeAssetRoot}\\`) || absolute.startsWith(`${runtimeAssetRoot}/`);
    return [path, insideRuntimeRoot && existsSync(absolute) ? createHash('sha256').update(readFileSync(absolute)).digest('hex') : null];
  })));
  return evaluatePetRuntimeApproval({
    economy: fromRoot('config/economy.v1.json'), catalog: fromRoot('config/pet-catalog.v1.json'),
    dailyPetLoop: fromRoot('config/daily-pet-loop.v1.json'), weeklyCompetition: fromRoot('config/weekly-competition.v1.json'),
    petRuntimeArt, sourceManifest: fromRoot('content/pets/source-manifest.v1.json'), rightsEvidence: fromRoot('config/pet-rights-evidence.v1.json'), assetFileHashes,
    trustedApprovalSigners: existsSync(resolve(root, 'config/trusted-approval-signers.v1.json')) ? fromRoot('config/trusted-approval-signers.v1.json') : undefined,
    trustedApprovalSignerRegistrySha256: process.env.PET_APPROVAL_SIGNER_REGISTRY_SHA256,
    approvalRecords: approvalFiles.filter((name) => existsSync(resolve(approvalsDir, name))).map((name) => readJson(resolve(approvalsDir, name))),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = evaluateRepository();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === 'APPROVED' ? 0 : 1;
}
