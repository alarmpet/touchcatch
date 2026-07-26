import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'config/normative-numeric-approvals.v1.json');
const registryPath = path.join(root, 'docs/requirements-registry.v1.json');
const hash = (value) => createHash('sha256').update(value).digest('hex');

function projectFile(relativePath) {
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`projection path escapes repository: ${relativePath}`);
  return fs.readFileSync(resolved, 'utf8');
}

function extractNormativeNumbers(text) {
  const semanticNoise = text
    .replace(/\bSHA-256\b/giu, '')
    .replace(/`(?=[^`]*[A-Za-z])(?=[^`]*\d)[^`]+`/gu, '')
    .replace(/\b\d+\.\d+\.\d+\b/gu, '')
    .replace(/\bAjv\s+\d+\b/gu, 'Ajv');
  return semanticNoise.match(/(?<![A-Za-z0-9])\d+(?:[.,]\d+)*(?:~\d+(?:[.,]\d+)*)?%?/gu) ?? [];
}

function generateProjection(manifest, registry) {
  const requirements = new Map(registry.requirements.map((requirement) => [requirement.id, requirement]));
  const entries = manifest.entries.map((entry) => {
    const requirement = requirements.get(entry.id);
    if (!requirement) throw new Error(`numeric approval requirement missing: ${entry.id}`);
    const projected = { ...entry, approvedTokens: extractNormativeNumbers(requirement.text) };
    if (entry.status === 'VERIFIED_LOCAL_SSOT') {
      if (!entry.ssotPath || !Array.isArray(entry.ssotAssertions) || entry.ssotAssertions.length === 0) throw new Error(`reviewed SSOT binding incomplete: ${entry.id}`);
      projected.ssotHash = hash(projectFile(entry.ssotPath));
      if (entry.sourcePath) projected.sourceHash = hash(projectFile(entry.sourcePath));
      return projected;
    }
    if (entry.status === 'UNAPPROVED_BASELINE') {
      projected.sourcePath = requirement.source;
      projected.sourceHash = hash(projectFile(requirement.source));
      return projected;
    }
    throw new Error(`unsupported reviewed numeric status: ${entry.id}:${entry.status}`);
  });
  return {
    ...manifest,
    entries,
    summary: {
      verifiedLocalSsot: entries.filter((entry) => entry.status === 'VERIFIED_LOCAL_SSOT').length,
      unapproved: entries.filter((entry) => entry.status === 'UNAPPROVED_BASELINE').length,
    },
  };
}

const mode = process.argv[2];
if (!['--check', '--write'].includes(mode) || process.argv.length !== 3) {
  console.error('usage: node tools/write-normative-approvals.mjs --check|--write');
  process.exit(2);
}

const current = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(current);
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const serialized = JSON.stringify(generateProjection(manifest, registry), null, 2) + '\n';

if (mode === '--check') {
  if (current !== serialized) {
    console.error('stale normative numeric approval projection');
    process.exit(1);
  }
} else {
  fs.writeFileSync(manifestPath, serialized);
}
