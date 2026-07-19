import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const root = resolve('apps/admin');
async function walk(directory) { const output = []; for (const name of await readdir(directory)) { const path = resolve(directory, name); const info = await stat(path); if (info.isDirectory()) output.push(...await walk(path)); else output.push(path); } return output; }
const clientFiles = (await walk(resolve(root, 'src/client'))).filter((file) => ['.ts', '.tsx'].includes(extname(file)));
for (const file of clientFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/gu)) if (match[1].includes('/server') || match[1].startsWith('../server')) throw new Error(`client imports privileged module: ${file} -> ${match[1]}`);
}
const staticRoot = resolve(root, '.next/static');
const chunks = (await walk(staticRoot)).filter((file) => file.endsWith('.js'));
if (!chunks.length) throw new Error('Next client build emitted no JavaScript chunks');
const forbiddenNames = ['SUPABASE_SECRET_KEY', 'ADMIN_ATTESTATION_KEY', 'ADMIN_AUDIT_KEY', 'ADMIN_DATABASE_URL', 'privateSolution', 'canonicalAnswer'];
const configuredSecrets = forbiddenNames.map((name) => process.env[name]).filter((value) => typeof value === 'string' && value.length >= 8);
for (const file of chunks) { const bytes = await readFile(file); const text = bytes.toString('utf8'); for (const marker of [...forbiddenNames, ...configuredSecrets]) if (text.includes(marker)) throw new Error(`privileged marker emitted in client chunk ${file}`); }
console.log(`${clientFiles.length} client modules and ${chunks.length} emitted chunks inspected; 0 privileged imports/secrets`);
