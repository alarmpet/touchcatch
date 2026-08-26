import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CATALOG_PATH = join('tools', 'pets', 'pet-generation-catalog.json');

async function main() {
  const raw = await readFile(CATALOG_PATH, 'utf8');
  const catalog = JSON.parse(raw);
  
  const pending = catalog.roster.filter(item => item.status === 'READY');
  const completed = catalog.roster.filter(item => item.status === 'COMPLETED');
  
  console.log(`[PET PIPELINE STATUS] Total: ${catalog.totalCount} | Completed: ${completed.length} | Pending: ${pending.length}`);
  console.log('\n--- Pending Characters Ready for Generation ---');
  for (const item of pending) {
    console.log(`- [${item.tier}] ${item.nameKo} (${item.slug})`);
  }
}

main().catch(console.error);
