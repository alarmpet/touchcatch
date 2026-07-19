import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root,'docs/design/ui-reference/manifest.json'),'utf8'));
const rights = JSON.parse(readFileSync(resolve(root,'docs/design/ui-reference/rights-manifest.json'),'utf8'));
const themeBytes = readFileSync(resolve(root,'config/ui-theme.v1.json'));
const themeHash = createHash('sha256').update(themeBytes).digest('hex');
const errors=[];
for(const [file,value] of [['schemas/ui-theme.schema.json',JSON.parse(themeBytes)],['schemas/ui-screen-contract.schema.json',JSON.parse(readFileSync(resolve(root,'config/ui-screen-contract.v1.json')))],['schemas/ui-reference-manifest.schema.json',manifest],['schemas/ui-reference-rights.schema.json',rights]]){const schema=JSON.parse(readFileSync(resolve(root,file)));const validate=new Ajv2020({strict:true,allErrors:true}).compile(schema);if(!validate(value))errors.push(`${file}: ${JSON.stringify(validate.errors)}`)}
if (themeHash !== '30b4cafd04f1fa04cdca7f447ae09e266cc6b62c3b53e690343d66afc9fd4d2d') errors.push('frozen theme token drift');
const screenHash=createHash('sha256').update(readFileSync(resolve(root,'config/ui-screen-contract.v1.json'))).digest('hex');
if(screenHash!=='7f5fb565ef4e3981d9943e71c1088028641c3b39661e8ec615d36b808bb5aa4c') errors.push('frozen screen contract drift');
if (manifest.themeHash !== themeHash) errors.push('theme hash mismatch');
if (manifest.rightsManifestSetId !== rights.setId) errors.push('rights set mismatch');
const ids=new Set(), files=new Set(), hashes=new Set();
const sourceFiles=['ChatGPT Image 2026년 7월 16일 오전 01_25_27 (1).png','ChatGPT Image 2026년 7월 16일 오전 01_25_28 (2).png','ChatGPT Image 2026년 7월 16일 오전 01_25_28 (3).png','ChatGPT Image 2026년 7월 16일 오전 01_25_28 (4).png'];
for (const entry of manifest.entries) {
  if (ids.has(entry.id)||files.has(entry.file)) errors.push('duplicate reference');
  ids.add(entry.id); files.add(entry.file);
  if (isAbsolute(entry.file)||entry.file.includes('..')) errors.push('non-relative path');
  const bytes=readFileSync(resolve(root,'docs/design/ui-reference',entry.file)); const actual=createHash('sha256').update(bytes).digest('hex');
  if(actual!==entry.sha256) errors.push(`hash mismatch ${entry.id}`);
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(bytes.subarray(1,4).toString()!=='PNG'||width!==entry.width||height!==entry.height)errors.push(`decoded PNG mismatch ${entry.id}`);
  const source=sourceFiles.map(file=>readFileSync(resolve(root,file))).find(candidate=>createHash('sha256').update(candidate).digest('hex')===entry.sha256);if(!source||!source.equals(bytes))errors.push(`root/copy byte identity ${entry.id}`);
  if(entry.width!==941||entry.height!==1672) errors.push(`dimension mismatch ${entry.id}`);
  if(entry.promptAvailable!==false||entry.promptHash!==null) errors.push(`prompt policy ${entry.id}`);
  if(entry.usage!=='CONCEPT_ONLY'||entry.rightsStatus!=='REVIEW_REQUIRED') errors.push(`approval policy ${entry.id}`);
  if(entry.themeReview.themeHash!==themeHash||entry.themeReview.status!=='REVIEW_REQUIRED') errors.push(`theme review ${entry.id}`);
  hashes.add(entry.sha256);
}
const rightIds=new Set(rights.records.map(x=>x.rightsRecordId));
const rightHashes=new Set(rights.records.map(x=>x.assetSha256)); const rightPairs=new Set(rights.records.map(x=>`${x.rightsRecordId}:${x.assetSha256}`));
if(rightIds.size!==manifest.entries.length||rightHashes.size!==manifest.entries.length||rightHashes.size!==hashes.size) errors.push('rights not exact one-to-one');
for(const entry of manifest.entries) if(!rightPairs.has(`${entry.rightsRecordId}:${entry.sha256}`)) errors.push(`rights exact pair ${entry.id}`);
if(errors.length){ console.error(errors.join('\n')); process.exit(1); }
console.log('4 references, 4 hashes matched, 0 schema errors, 0 absolute paths');
