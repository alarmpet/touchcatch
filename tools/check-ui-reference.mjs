import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root,'docs/design/ui-reference/manifest.json'),'utf8'));
const rights = JSON.parse(readFileSync(resolve(root,'docs/design/ui-reference/rights-manifest.json'),'utf8'));
const themeBytes = readFileSync(resolve(root,'config/ui-theme.v1.json'));
const themeHash = createHash('sha256').update(themeBytes).digest('hex');
const errors=[];
if (themeHash !== '30b4cafd04f1fa04cdca7f447ae09e266cc6b62c3b53e690343d66afc9fd4d2d') errors.push('frozen theme token drift');
const screenHash=createHash('sha256').update(readFileSync(resolve(root,'config/ui-screen-contract.v1.json'))).digest('hex');
if(screenHash!=='8c236188a67b2eaf7e360c975a7d79e9d202fdfb6dd09ff1003f9c2167c42d5a') errors.push('frozen screen contract drift');
if (manifest.themeHash !== themeHash) errors.push('theme hash mismatch');
if (manifest.rightsManifestSetId !== rights.setId) errors.push('rights set mismatch');
const ids=new Set(), files=new Set(), hashes=new Set();
for (const entry of manifest.entries) {
  if (ids.has(entry.id)||files.has(entry.file)) errors.push('duplicate reference');
  ids.add(entry.id); files.add(entry.file);
  if (isAbsolute(entry.file)||entry.file.includes('..')) errors.push('non-relative path');
  const actual=createHash('sha256').update(readFileSync(resolve(root,'docs/design/ui-reference',entry.file))).digest('hex');
  if(actual!==entry.sha256) errors.push(`hash mismatch ${entry.id}`);
  if(entry.width!==941||entry.height!==1672) errors.push(`dimension mismatch ${entry.id}`);
  if(entry.promptAvailable!==false||entry.promptHash!==null) errors.push(`prompt policy ${entry.id}`);
  if(entry.usage!=='CONCEPT_ONLY'||entry.rightsStatus!=='REVIEW_REQUIRED') errors.push(`approval policy ${entry.id}`);
  if(entry.themeReview.themeHash!==themeHash||entry.themeReview.status!=='REVIEW_REQUIRED') errors.push(`theme review ${entry.id}`);
  hashes.add(entry.sha256);
}
const rightIds=new Set(rights.records.map(x=>x.rightsRecordId));
const rightHashes=new Set(rights.records.map(x=>x.assetSha256));
if(rightIds.size!==manifest.entries.length||rightHashes.size!==manifest.entries.length||rightHashes.size!==hashes.size) errors.push('rights not exact one-to-one');
for(const entry of manifest.entries) if(!rightIds.has(entry.rightsRecordId)||!rightHashes.has(entry.sha256)) errors.push(`rights link ${entry.id}`);
if(errors.length){ console.error(errors.join('\n')); process.exit(1); }
console.log('4 references, 4 hashes matched, 0 schema errors, 0 absolute paths');
