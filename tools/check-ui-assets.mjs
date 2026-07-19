import {Ajv2020} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const target=process.argv.includes('--target')?process.argv[process.argv.indexOf('--target')+1]:'contract';
if(!['contract','beta'].includes(target)){console.error('target must be contract|beta');process.exit(2)}
const manifestPath=process.env.UI_ASSET_MANIFEST??'config/ui-runtime-assets.v1.json';
const schema=JSON.parse(readFileSync('schemas/ui-runtime-assets.schema.json'));
const value=JSON.parse(readFileSync(manifestPath));
const themeManifest=JSON.parse(readFileSync('docs/design/ui-reference/manifest.json'));
const ajv=new Ajv2020({strict:true,allErrors:true});addFormats(ajv);const validate=ajv.compile(schema);
if(!validate(value)){console.error(validate.errors);process.exit(1)}
if(target==='beta'&&value.lifecycle!=='APPROVED'){console.error('beta requires APPROVED assets');process.exit(1)}

export function decodeWebpDimensions(bytes){
 if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw new Error('asset is not WebP');
 const kind=bytes.toString('ascii',12,16);
 if(kind==='VP8X')return[1+bytes.readUIntLE(24,3),1+bytes.readUIntLE(27,3)];
 if(kind==='VP8L'){const bits=bytes.readUInt32LE(21);return[1+(bits&0x3fff),1+((bits>>>14)&0x3fff)];}
 if(kind==='VP8 '){for(let i=20;i+9<bytes.length;i++)if(bytes[i]===0x9d&&bytes[i+1]===0x01&&bytes[i+2]===0x2a)return[bytes.readUInt16LE(i+3)&0x3fff,bytes.readUInt16LE(i+5)&0x3fff];}
 throw new Error('unsupported WebP dimensions');
}

if(value.lifecycle==='APPROVED'){
 const ids=new Set(),files=new Set(),hashes=new Set(),refs=new Map(value.buildReferences.map(x=>[x.assetId,x.file]));
 if(refs.size!==value.buildReferences.length||refs.size!==value.entries.length)throw new Error('build references must be exact one-to-one');
 for(const entry of value.entries){
  if(ids.has(entry.assetId)||files.has(entry.file)||hashes.has(entry.sha256))throw new Error('duplicate asset id, file, or hash');ids.add(entry.assetId);files.add(entry.file);hashes.add(entry.sha256);
  if(!entry.file.startsWith(`${entry.assetClass}/`))throw new Error('asset class/file mismatch');if(entry.rights.assetSha256!==entry.sha256)throw new Error('rights exact pair mismatch');if(refs.get(entry.assetId)!==entry.file)throw new Error('build reference mismatch');
  const file=resolve(process.env.UI_ASSET_ROOT??'content/runtime-assets',entry.file);if(!existsSync(file))throw new Error(`missing build reference ${file}`);const bytes=readFileSync(file);
  if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256||bytes.length!==entry.encodedBytes)throw new Error('asset bytes drift');
  if(entry.themeReview.version!==themeManifest.themeVersion||entry.themeReview.artifactHash!==themeManifest.themeHash)throw new Error('theme review is stale');
  if(entry.modelReview.version!==entry.provenance.modelVersion||entry.modelReview.artifactHash!==entry.provenance.promptHash)throw new Error('model review is stale');
  if(entry.textReview.artifactHash!==entry.sha256||entry.visualReview.artifactHash!==entry.sha256)throw new Error('asset review is stale');
  if(entry.mimeType==='image/png'){if(bytes.toString('ascii',1,4)!=='PNG')throw new Error('asset is not PNG');if(bytes.readUInt32BE(16)!==entry.width||bytes.readUInt32BE(20)!==entry.height)throw new Error('asset dimensions drift');}
  else if(entry.mimeType==='image/webp'){const [width,height]=decodeWebpDimensions(bytes);if(width!==entry.width||height!==entry.height)throw new Error('asset dimensions drift');}
  else if(entry.mimeType.startsWith('image/')&&(!entry.width||!entry.height))throw new Error('image dimensions required');
  else if(entry.mimeType==='font/woff2'&&(entry.width!==null||entry.height!==null))throw new Error('font dimensions must be null');
 }
}
console.log(`UiRuntimeAssetManifestV1 ${value.lifecycle}: ${value.entries.length} runtime assets; target=${target}`);
