import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactSha256, signableApprovalRecord } from '../check-pet-runtime-approval.mjs';
import { APPROVAL_GROUP, buildCasualLearningPack } from '../check-learning-content-approval.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const approvedAt = '2026-08-24T15:00:00.000Z';
const decisionId = 'android-casual-content-2026-08-24';
const keyId = 'android-casual-content-2026-08-24';
const approvedBy = 'product-owner';

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const inventory = readJson('content/learning/inventory.v1.json');
const derived = readJson('content/learning/derived-hitboxes.v1.json');
const hunts = readJson('content/learning/word-hunts.curated.v1.json');
const englishAdmit = inventory.entries.filter((entry) => (
  entry.decision === 'ADMIT' && entry.category === 'ENGLISH'
));
if (englishAdmit.length !== 5) {
  throw new Error(`expected 5 ENGLISH ADMIT packs, found ${englishAdmit.length}`);
}

const pair = generateKeyPairSync('ed25519');
const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const existingSigners = readJson('config/trusted-approval-signers.v1.json');
if (existingSigners.keys.some((key) => key.keyId === keyId)) {
  throw new Error(`${keyId} is already in the signer registry`);
}
const trustedApprovalSigners = {
  ...existingSigners,
  keys: [
    ...existingSigners.keys,
    { keyId, status: 'ACTIVE', publicKeyPem },
  ],
};

mkdirSync(resolve(root, 'content/learning/approvals'), { recursive: true });
const packs = englishAdmit.map((entry) => {
  const draft = readJson(`content/learning/drafts/${entry.key}.json`);
  const pack = buildCasualLearningPack(
    root,
    entry.key,
    entry,
    draft,
    derived.packs[entry.key],
    hunts.packs[entry.key],
    approvedAt,
  );
  writeJson(`content/learning/approvals/${entry.key}.v1.json`, pack);
  return pack;
});

const weeklyRecord = {
  approvalGroup: APPROVAL_GROUP,
  decisionId,
  approvedBy,
  approvedAt,
  artifacts: packs.map((pack) => ({
    path: `content/learning/approvals/${pack.key}.v1.json`,
    sha256: artifactSha256(pack),
  })),
};
weeklyRecord.signerKeyId = keyId;
weeklyRecord.signature = sign(null, Buffer.from(signableApprovalRecord(weeklyRecord)), pair.privateKey).toString('base64');

writeJson('config/trusted-approval-signers.v1.json', trustedApprovalSigners);
writeJson('docs/approvals/learning-content-v1-approval.json', weeklyRecord);
writeJson('docs/decisions/2026-08-24-android-casual-content-approval.json', {
  decisionId,
  approvedBy,
  approvedAt,
  scope: 'Android closed-beta casual learning content: 5 ENGLISH ADMIT packs with derived hitboxes',
  keys: englishAdmit.map((entry) => entry.key),
  excludes: ['pet-economy', 'daily-pet-loop', 'pet-runtime-art', 'pet-rights', 'public-store', 'ios', 'realtime-pvp', 'legal-license-opinion'],
  signerKeyId: keyId,
  trustedApprovalSignerRegistrySha256: artifactSha256(trustedApprovalSigners),
  note: 'Product-owner closed-beta admission. Public signer only. The issuing private key is not stored in this repository. This is not a public store listing or a third-party license opinion.',
});

process.stdout.write(`${JSON.stringify({
  trustedApprovalSignerRegistrySha256: artifactSha256(trustedApprovalSigners),
  keys: packs.map((pack) => pack.key),
}, null, 2)}\n`);
