import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Source and bundle scanner for the production mobile surface.
 *
 * This is not a substitute for a signed-artifact scan, but it is the same
 * marker list that scan will use on an exported file. Route sources are the
 * default input; tests can also feed a buffer that pretends to be a bundle.
 */
export const FORBIDDEN_MARKERS = [
  { id: 'learning-demo-preview', pattern: /learning-demo\/(?:preview-home|preview-registry|LearningDemoScreen|preview-registry\.generated)/u },
  { id: 'private-registry', pattern: /learning-demo\/registry/u },
  { id: 'canonical-answer', pattern: /canonicalAnswer/u },
  { id: 'private-solution', pattern: /privateSolutionHash/u },
  { id: 'fixture-sentinel', pattern: /TOUCHCATCH_CANONICAL_ANSWER_SENTINEL/u },
  { id: 'draft-path', pattern: /content\/learning\/drafts/u },
  { id: 'source-path', pattern: /content\/learning\/source/u },
  { id: 'database-url', pattern: /DATABASE_URL/u },
  { id: 'supabase-secret', pattern: /SUPABASE_SECRET_KEY/u },
  { id: 'evaluate-preview', pattern: /evaluatePreviewAnswer/u },
];

export function scanText(text, origin = 'memory') {
  return FORBIDDEN_MARKERS
    .filter((marker) => marker.pattern.test(text))
    .map((marker) => ({ id: marker.id, origin }));
}

export function collectFiles(root, suffixes = ['.ts', '.tsx', '.js', '.jsx']) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        if (entry === 'node_modules' || entry === '.expo') continue;
        stack.push(path.join(current, entry));
      }
      continue;
    }
    if (suffixes.some((suffix) => current.endsWith(suffix))) out.push(current);
  }
  return out;
}

export function scanFiles(files) {
  return files.flatMap((file) => scanText(fs.readFileSync(file, 'utf8'), file));
}

export function scanProductionAppRoutes(repoRoot = process.cwd()) {
  return scanFiles(collectFiles(path.join(repoRoot, 'apps/mobile/app')));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const hits = scanProductionAppRoutes();
  if (hits.length > 0) {
    for (const hit of hits) console.error(`[production-boundary] ${hit.id} in ${hit.origin}`);
    process.exit(1);
  }
  console.log('[production-boundary] 0 forbidden markers in apps/mobile/app');
}
