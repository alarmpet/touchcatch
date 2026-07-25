import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const catalogPath = resolve(projectRoot, 'content/learning/catalog.v1.json');
const schemaPath = resolve(projectRoot, 'content/learning/catalog.schema.json');

export async function validateCatalog() {
  const [catalogContent, schemaContent] = await Promise.all([
    readFile(catalogPath, 'utf8'),
    readFile(schemaPath, 'utf8')
  ]);

  const catalog = JSON.parse(catalogContent);
  const schema = JSON.parse(schemaContent);

  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const validate = ajv.compile(schema);
  const valid = validate(catalog);

  if (!valid) {
    console.error('❌ [CATALOG VALIDATION ERROR]');
    console.error(validate.errors);
    throw new Error(`CATALOG_SCHEMA_INVALID: ${validate.errors?.length} validation errors found.`);
  }

  console.log(`✅ [CATALOG VALIDATED] catalog.v1.json is valid with ${catalog.entries.length} entries.`);
  return catalog;
}

if (process.argv[1] && process.argv[1].endsWith('validate-catalog.js')) {
  await validateCatalog();
}
