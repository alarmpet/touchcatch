import fs from 'node:fs/promises';
import process from 'node:process';

const encodeForGeneratedJson = (value) => JSON.stringify(value).slice(1, -1);

export async function checkUtf8Registry({
  manifestPath = 'content/learning/manifest.v1.json',
  draftsRoot = 'content/learning/drafts',
  registryPath = 'apps/mobile/src/learning-demo/registry.ts',
} = {}) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const registry = await fs.readFile(registryPath, 'utf8');
  const errors = [];
  let checkedValues = 0;

  if (registry.includes('\uFFFD')) errors.push('REGISTRY_REPLACEMENT_CHARACTER');

  for (const entry of manifest.entries) {
    if (entry.category !== 'PROVERB' && entry.category !== 'IDIOM') continue;
    const bundle = JSON.parse(
      await fs.readFile(`${draftsRoot}/${entry.key}.json`, 'utf8'),
    );
    const challenge = bundle.privateSolution.finalChallenge;
    const values = [challenge.canonicalAnswer, challenge.meaning.prompt];
    for (const step of challenge.hintLadder ?? []) values.push(step.localizedText.ko);

    for (const value of values) {
      checkedValues += 1;
      if (typeof value !== 'string' || !/[\u3131-\u318E\uAC00-\uD7A3]/u.test(value)) {
        errors.push(`KOREAN_TEXT_MISSING:${entry.key}`);
      } else if (!registry.includes(encodeForGeneratedJson(value))) {
        errors.push(`REGISTRY_TEXT_DRIFT:${entry.key}`);
      }
    }
  }

  const result = { ok: errors.length === 0, checkedValues, errors: [...new Set(errors)].sort() };
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}

if (process.argv[1]?.endsWith('check-utf8-registry.js')) {
  console.log(JSON.stringify(await checkUtf8Registry(), null, 2));
}
