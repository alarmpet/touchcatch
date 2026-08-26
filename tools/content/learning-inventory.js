import fs from 'node:fs';
import path from 'node:path';

export const INVENTORY_PATH = 'content/learning/inventory.v1.json';

const ADMIT_REASON =
  'Manifest candidate with usable derived hitboxes and an admitted hint ladder. Still DRAFT/publishBlocked until rights and education signatures exist. ADMIT is not a publish approval.';
const HOLD_NOT_MANIFEST =
  'Not in content/learning/manifest.v1.json. Out of the Android casual-beta pool until a human review promotes it.';
const HOLD_NOT_USABLE = 'Derived hitboxes are missing or not usable.';
const HOLD_NOT_ELIGIBLE = 'Not ranked-eligible or the hint ladder is not admitted.';

export function classifyPack(input) {
  if (!input.inManifest) {
    return { decision: 'HOLD', reason: HOLD_NOT_MANIFEST };
  }
  if (input.derivedUsable !== true) {
    return { decision: 'HOLD', reason: HOLD_NOT_USABLE };
  }
  if (input.hintLadderStatus !== 'ADMITTED') {
    return { decision: 'HOLD', reason: HOLD_NOT_ELIGIBLE };
  }
  return { decision: 'ADMIT', reason: ADMIT_REASON };
}

function sourceBaseKey(name) {
  if (name.endsWith('-a') || name.endsWith('-b')) return name.slice(0, -2);
  return name;
}

export function evaluateLearningInventory({
  manifestEntries,
  draftKeys,
  sourceKeys,
  derivedUsableByKey,
  draftMetaByKey,
}) {
  const keys = new Set([
    ...manifestEntries.map((entry) => entry.key),
    ...draftKeys,
    ...sourceKeys.map(sourceBaseKey),
  ]);
  const manifestByKey = new Map(manifestEntries.map((entry) => [entry.key, entry]));
  const entries = [...keys].sort().map((key) => {
    const manifest = manifestByKey.get(key);
    const draft = draftMetaByKey[key];
    const classified = classifyPack({
      inManifest: manifest !== undefined,
      derivedUsable: derivedUsableByKey[key] === true,
      rankedEligible: manifest?.rankedEligible === true,
      hintLadderStatus: manifest?.hintLadderAdmission?.status,
    });
    return {
      key,
      decision: classified.decision,
      reason: classified.reason,
      inManifest: manifest !== undefined,
      category: manifest?.category ?? draft?.category ?? null,
      rankedEligible: manifest?.rankedEligible === true,
      publishBlocked: manifest?.publishBlocked === true,
      derivedUsable: derivedUsableByKey[key] === true,
      rightsReviewStatus: draft?.rightsReviewStatus ?? null,
      educationReviewStatus: draft?.educationReviewStatus ?? null,
      hasDraft: draftKeys.includes(key),
      hasSourcePair: sourceKeys.includes(`${key}-a`) && sourceKeys.includes(`${key}-b`),
    };
  });

  const unclassified = entries.filter((entry) => !['ADMIT', 'HOLD', 'REJECT'].includes(entry.decision));
  const admit = entries.filter((entry) => entry.decision === 'ADMIT').map((entry) => entry.key);
  return {
    ok: unclassified.length === 0,
    errors: unclassified.map((entry) => `UNCLASSIFIED:${entry.key}`),
    counts: {
      total: entries.length,
      ADMIT: admit.length,
      HOLD: entries.filter((entry) => entry.decision === 'HOLD').length,
      REJECT: entries.filter((entry) => entry.decision === 'REJECT').length,
    },
    admit,
    entries,
  };
}

function readKeys(root, suffix) {
  return fs.readdirSync(root)
    .filter((file) => file.endsWith(suffix))
    .map((file) => file.slice(0, -suffix.length));
}

export function loadLearningInventoryInputs(root = process.cwd()) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'content/learning/manifest.v1.json'), 'utf8'));
  const derived = JSON.parse(fs.readFileSync(path.join(root, 'content/learning/derived-hitboxes.v1.json'), 'utf8'));
  const draftsRoot = path.join(root, 'content/learning/drafts');
  const draftKeys = readKeys(draftsRoot, '.json');
  const draftMetaByKey = Object.fromEntries(draftKeys.map((key) => {
    const draft = JSON.parse(fs.readFileSync(path.join(draftsRoot, `${key}.json`), 'utf8'));
    return [key, {
      category: draft.publicContent?.category ?? null,
      rightsReviewStatus: draft.rightsReviewStatus ?? null,
      educationReviewStatus: draft.educationReviewStatus ?? null,
    }];
  }));
  const derivedUsableByKey = Object.fromEntries(
    Object.entries(derived.packs ?? {}).map(([key, pack]) => [key, pack?.usable === true]),
  );
  return {
    manifestEntries: manifest.entries,
    draftKeys,
    sourceKeys: readKeys(path.join(root, 'content/learning/source'), '.png'),
    derivedUsableByKey,
    draftMetaByKey,
  };
}

export function buildLearningInventoryDocument(inputs = loadLearningInventoryInputs()) {
  const evaluated = evaluateLearningInventory(inputs);
  return {
    schemaVersion: '1.0.0',
    generatedFor: '2026-08-24-android-casual-beta',
    note: 'ADMIT is the candidate casual-beta pool. It is not a rights, education, or publish approval. HOLD packs stay out of release input. No agent may flip DRAFT packs to PUBLISHED.',
    counts: evaluated.counts,
    entries: evaluated.entries,
  };
}
