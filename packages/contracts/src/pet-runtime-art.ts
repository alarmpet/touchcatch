import type { PetCatalogRevisionV1 } from './pet-catalog.js';

export type PetRuntimeArtEntryV1 = Readonly<{
  petId: string;
  sourceFile: string;
  sourceSha256: string;
  thumbnailFile: string;
  thumbnailUrl: string;
  fullFile: string;
  fullUrl: string;
  thumbnailSha256: string;
  fullSha256: string;
  rights: Readonly<{ evidenceId: string; approvedBy: string; approvedAt: string }>;
  visual: Readonly<{
    reviewId: string;
    smallCardApproved: true;
    cropApproved: true;
    backgroundApproved: true;
    approvedBy: string;
    approvedAt: string;
  }>;
}>;

export type PetRuntimeArtV1 = Readonly<{
  schemaVersion: 1;
  status: 'DRAFT' | 'APPROVED';
  catalogRevision: string;
  catalogHash: string;
  approvalDecisionId?: string;
  approvedBy?: string;
  approvedAt?: string;
  entries: readonly PetRuntimeArtEntryV1[];
}>;

const hashPattern = /^[0-9a-f]{64}$/;
const canonicalTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const topKeys = new Set(['schemaVersion', 'status', 'catalogRevision', 'catalogHash', 'approvalDecisionId', 'approvedBy', 'approvedAt', 'entries']);
const entryKeys = new Set(['petId', 'sourceFile', 'sourceSha256', 'thumbnailFile', 'thumbnailUrl', 'thumbnailSha256', 'fullFile', 'fullUrl', 'fullSha256', 'rights', 'visual']);
const rightsKeys = new Set(['evidenceId', 'approvedBy', 'approvedAt']);
const visualKeys = new Set(['reviewId', 'smallCardApproved', 'cropApproved', 'backgroundApproved', 'approvedBy', 'approvedAt']);

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length > 0) throw new TypeError(`${label} has additional properties: ${extra.join(', ')}`);
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function productionIdentity(value: unknown, label: string): string {
  const result = text(value, label);
  if (result !== result.trim() || /^test-/i.test(result)) throw new TypeError(`${label} must be a canonical production identity`);
  return result;
}

function canonicalTime(value: unknown, label: string): string {
  const result = text(value, label);
  if (!canonicalTimePattern.test(result) || new Date(result).toISOString() !== result) {
    throw new TypeError(`${label} must be canonical millisecond UTC`);
  }
  return result;
}

function approvedReview(value: unknown, kind: 'rights' | 'visual'): void {
  const item = record(value, kind);
  exactKeys(item, kind === 'rights' ? rightsKeys : visualKeys, kind);
  productionIdentity(item[kind === 'rights' ? 'evidenceId' : 'reviewId'], `${kind} id`);
  productionIdentity(item.approvedBy, `${kind} approvedBy`);
  canonicalTime(item.approvedAt, `${kind} approvedAt`);
  if (kind === 'visual' && (item.smallCardApproved !== true || item.cropApproved !== true || item.backgroundApproved !== true)) {
    throw new TypeError('visual review must approve small card, crop, and background');
  }
}

export function parsePetRuntimeArtV1(input: unknown, catalog: PetCatalogRevisionV1): PetRuntimeArtV1 {
  const value = record(input, 'pet runtime art');
  exactKeys(value, topKeys, 'pet runtime art');
  if (value.schemaVersion !== 1 || (value.status !== 'DRAFT' && value.status !== 'APPROVED') || !Array.isArray(value.entries)) {
    throw new TypeError('invalid pet runtime art structure');
  }
  if (text(value.catalogRevision, 'catalogRevision') !== catalog.catalogRevision || text(value.catalogHash, 'catalogHash') !== catalog.catalogHash) {
    throw new TypeError('pet runtime art catalog revision/hash mismatch');
  }
  if (value.status === 'APPROVED') {
    productionIdentity(value.approvalDecisionId, 'approvalDecisionId');
    productionIdentity(value.approvedBy, 'approvedBy');
    canonicalTime(value.approvedAt, 'approvedAt');
  }

  const catalogIds = new Set(catalog.entries.map(({ petId }) => petId));
  const ids = new Set<string>();
  const sourceFiles = new Set<string>();
  const sourceHashes = new Set<string>();
  const runtimeHashes = new Set<string>();
  for (const rawEntry of value.entries) {
    const entry = record(rawEntry, 'pet runtime art entry');
    exactKeys(entry, entryKeys, 'pet runtime art entry');
    const petId = text(entry.petId, 'petId');
    const sourceFile = text(entry.sourceFile, 'sourceFile');
    text(entry.thumbnailFile, 'thumbnailFile'); text(entry.fullFile, 'fullFile');
    const sourceSha256 = text(entry.sourceSha256, 'sourceSha256');
    const thumbnailSha256 = text(entry.thumbnailSha256, 'thumbnailSha256');
    const fullSha256 = text(entry.fullSha256, 'fullSha256');
    if (!catalogIds.has(petId) || ids.has(petId)) throw new TypeError('runtime art petId must map exactly once to the active catalog');
    if (sourceFiles.has(sourceFile) || sourceHashes.has(sourceSha256) || runtimeHashes.has(thumbnailSha256) || runtimeHashes.has(fullSha256) || thumbnailSha256 === fullSha256) throw new TypeError('runtime art files and hashes must be unique');
    if (!hashPattern.test(sourceSha256) || !hashPattern.test(thumbnailSha256) || !hashPattern.test(fullSha256)) throw new TypeError('runtime art hashes must be lowercase SHA-256');
    for (const [field, expectedHash] of [['thumbnailUrl', thumbnailSha256], ['fullUrl', fullSha256]] as const) {
      const url = new URL(text(entry[field], field));
      if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== '') {
        throw new TypeError(`${field} must use credential-free HTTPS without a fragment`);
      }
      if (!url.pathname.includes(expectedHash)) throw new TypeError(`${field} must use a content-addressed immutable path`);
    }
    approvedReview(entry.rights, 'rights');
    approvedReview(entry.visual, 'visual');
    ids.add(petId); sourceFiles.add(sourceFile); sourceHashes.add(sourceSha256); runtimeHashes.add(thumbnailSha256); runtimeHashes.add(fullSha256);
  }
  if (ids.size !== catalogIds.size) throw new TypeError('runtime art must map every active catalog pet exactly once');
  return value as unknown as PetRuntimeArtV1;
}
