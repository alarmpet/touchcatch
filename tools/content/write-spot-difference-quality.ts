import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type CatalogEntry = { key: string; changes: string[] };
type Difference = { objectiveId: string; tier: 'NORMAL' | 'HARD'; hitboxes: { imageA: { cx: number; cy: number } } };

const root = resolve(import.meta.dirname, '../..');
const learning = resolve(root, 'content/learning');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const canonicalJson = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonicalJson).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`
    : JSON.stringify(value);
const zoneFor = ({ cx, cy }: { cx: number; cy: number }) => 'ABCDEFGHI'[Math.min(2, Math.floor(cy * 3)) * 3 + Math.min(2, Math.floor(cx * 3))]!;

function objectiveDetails(change: string) {
  const instruction = change.trim().replace(/[.;]$/, '');
  const lower = instruction.toLocaleLowerCase('en-US');
  const changeMatch = /^change (?:only )?(.+?)(?: from (.+?))? to (.+)$/i.exec(instruction);
  if (changeMatch) {
    const [, target, before, after] = changeMatch;
    const [beforeTransition = '', afterTransition = ''] = instruction.split(/\bto\b/i, 2);
    const quantity = /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i;
    const form = /\b(shape|sphere|star(?:-shaped)?|rectangle|diamond|circle|square|oval|pointed|rounded|eyepiece|prongs|blades?)\b/i;
    return {
      target: target!,
      location: /\b(near|below|above|left|right|lower|upper|foreground|center|front|back)\b/i.test(target!) ? target! : 'PENDING',
      before: before ?? 'PENDING',
      after: after!,
      changeType: quantity.test(beforeTransition) && quantity.test(afterTransition) ? 'COUNT' : form.test(beforeTransition) && form.test(afterTransition) ? 'SHAPE' : 'COLOR',
    };
  }
  if (/^add /i.test(instruction)) return { target: instruction.replace(/^add (?:one )?/i, ''), location: 'PENDING', before: 'absent from the source image', after: 'present in the edited image', changeType: 'ADD' };
  if (/^remove /i.test(instruction)) return { target: instruction.replace(/^remove (?:only )?/i, ''), location: 'PENDING', before: 'present in the source image', after: 'removed from the edited image', changeType: 'REMOVE' };
  if (/^reverse /i.test(instruction)) return { target: instruction.replace(/^reverse (?:only )?/i, ''), location: 'PENDING', before: 'original direction in the source image', after: 'reversed direction in the edited image', changeType: 'DIRECTION' };
  return { target: instruction, location: 'PENDING', before: 'PENDING', after: 'PENDING', changeType: lower.includes('remove') ? 'REMOVE' : 'SHAPE' };
}

async function editInstructions(key: string) {
  const text = await readFile(resolve(learning, 'prompts', `${key}-edit.txt`), 'utf8');
  const numbered = [...text.matchAll(/^\s*\d+\.\s*(.+)$/gmu)].map((match) => match[1]!.trim());
  if (numbered.length === 10) return numbered;
  const block = text.match(/Make exactly(?: these)? ten localized(?: visual)? changes(?: and no others)?:\s*([\s\S]*?)(?:\nConstraints:|$)/iu)?.[1];
  if (!block) throw new Error(`UNPARSEABLE_EDIT_PROMPT:${key}`);
  const instructions = block.split(';').map((instruction) => instruction.trim().replace(/\.$/u, '')).filter(Boolean);
  if (instructions.length !== 10) throw new Error(`EXPECTED_TEN_EDIT_INSTRUCTIONS:${key}:${instructions.length}`);
  return instructions;
}

function diagnostics(objectives: Array<{ zone: string; changeType: string }>) {
  const zones = [...new Set(objectives.map(({ zone }) => zone))].sort();
  const zoneCounts = Object.fromEntries(zones.map((zone) => [zone, objectives.filter((objective) => objective.zone === zone).length]));
  const changeTypes = [...new Set(objectives.map(({ changeType }) => changeType))].sort();
  const changeTypeCounts = Object.fromEntries(changeTypes.map((changeType) => [changeType, objectives.filter((objective) => objective.changeType === changeType).length]));
  return { zones, zoneCounts, changeTypes, changeTypeCounts };
}

const catalog = JSON.parse(await readFile(resolve(learning, 'catalog.v1.json'), 'utf8')) as { entries: CatalogEntry[] };
const entries = await Promise.all(catalog.entries.map(async (catalogEntry) => {
  const bundle = JSON.parse(await readFile(resolve(learning, 'drafts', `${catalogEntry.key}.json`), 'utf8')) as { privateSolution: { differences: Difference[] } };
  const instructions = await editInstructions(catalogEntry.key);
  const objectives = bundle.privateSolution.differences.map((difference, index) => ({
    objectiveId: difference.objectiveId,
    tier: difference.tier,
    salience: index < 4 ? 'CLEAR' : index < 7 ? 'MODERATE' : 'FOCUSED',
    ...objectiveDetails(instructions[index]!),
    zone: zoneFor(difference.hitboxes.imageA),
    authoringEvidence: { status: 'PENDING', rawInstruction: instructions[index]!, blocker: 'AUTHORING_FIELDS_REQUIRE_REVIEW' },
    mobileReview: { status: 'PENDING', reviewer: null, reviewedAt: null },
  }));
  const computed = diagnostics(objectives);
  const spatialPass = computed.zones.length >= 7 && Math.max(...Object.values(computed.zoneCounts)) <= 2;
  const typePass = computed.changeTypes.length >= 4 && Math.max(...Object.values(computed.changeTypeCounts)) <= 4;
  return {
    contentKey: catalogEntry.key,
    catalogChangesSha256: sha256(canonicalJson(catalogEntry.changes)),
    reviewViewport: { width: 375, height: 667 },
    objectives,
    imagePairReview: { status: 'PENDING', sameComposition: null, sameCamera: null, sameLightingDirection: null, sameArtStyle: null, unintendedChangeStatus: 'PENDING', reviewedBy: null, reviewedAt: null },
    releaseReadiness: {
      status: 'PENDING',
      blockers: ['CATALOG_DRAFT', 'AUTHORING_FIELDS_REQUIRE_REVIEW', ...(spatialPass ? [] : ['SPATIAL_DISTRIBUTION_REQUIRED']), ...(typePass ? [] : ['CHANGE_TYPE_DIVERSITY_REQUIRED']), 'MOBILE_REVIEW_REQUIRED', 'IMAGE_PAIR_REVIEW_REQUIRED'],
      diagnostics: computed,
    },
  };
}));

await writeFile(resolve(learning, 'spot-difference-quality.v1.json'), `${JSON.stringify({ schemaVersion: '1.0.0', entries }, null, 2)}\n`, 'utf8');
