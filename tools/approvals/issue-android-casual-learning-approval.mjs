import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactSha256, signableApprovalRecord } from '../check-pet-runtime-approval.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const approval = {
  status: 'APPROVED',
  approvalDecisionId: 'android-casual-beta-2026-08-24',
  approvedBy: 'product-owner',
  approvedAt: '2026-08-24T12:00:00.000Z',
};
const keyId = 'android-casual-beta-2026-08-24';

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const pair = generateKeyPairSync('ed25519');
const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const trustedApprovalSigners = {
  schemaVersion: 1,
  status: 'APPROVED',
  approvalDecisionId: approval.approvalDecisionId,
  approvedBy: approval.approvedBy,
  approvedAt: approval.approvedAt,
  keys: [{ keyId, status: 'ACTIVE', publicKeyPem }],
};

const weekly = { ...readJson('config/weekly-competition.v1.json'), ...approval };
const hint = { ...readJson('config/hint-policy.v1.json'), ...approval };

const weeklyRecord = {
  approvalGroup: 'WEEKLY_COMPETITION_V1',
  decisionId: approval.approvalDecisionId,
  approvedBy: approval.approvedBy,
  approvedAt: approval.approvedAt,
  artifacts: [{ path: 'config/weekly-competition.v1.json', sha256: artifactSha256(weekly) }],
};
weeklyRecord.signerKeyId = keyId;
weeklyRecord.signature = sign(null, Buffer.from(signableApprovalRecord(weeklyRecord)), pair.privateKey).toString('base64');

mkdirSync(resolve(root, 'docs/approvals'), { recursive: true });
writeJson('config/trusted-approval-signers.v1.json', trustedApprovalSigners);
writeJson('config/weekly-competition.v1.json', weekly);
writeJson('config/hint-policy.v1.json', hint);
writeJson('docs/approvals/weekly-competition-v1-approval.json', weeklyRecord);
writeJson('docs/decisions/2026-08-24-android-casual-learning-approval.json', {
  decisionId: approval.approvalDecisionId,
  approvedBy: approval.approvedBy,
  approvedAt: approval.approvedAt,
  scope: 'Android closed-beta casual learning attempts',
  excludes: ['pet-economy', 'daily-pet-loop', 'pet-runtime-art', 'pet-rights', 'public-store', 'ios', 'realtime-pvp'],
  signerKeyId: keyId,
  trustedApprovalSignerRegistrySha256: artifactSha256(trustedApprovalSigners),
  note: 'Public signer only. The issuing private key is not stored in this repository.',
});

process.stdout.write(`${JSON.stringify({
  trustedApprovalSignerRegistrySha256: artifactSha256(trustedApprovalSigners),
  weeklyCompetitionSha256: artifactSha256(weekly),
  hintPolicySha256: artifactSha256(hint),
}, null, 2)}\n`);
