import fs from 'node:fs';
import path from 'node:path';
import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import { canonicalJsonSha256 } from '../../contracts/src/canonical-json.js';
import type { HintStepV1 } from '../../contracts/src/content.js';
import {
  segmentAnswer,
  validateHintLadder,
  type HintCategory,
  type HintLadderValidationContext,
} from './hint-ladder.js';

const root = process.cwd();
const schema = JSON.parse(
  fs.readFileSync(path.join(root, 'content/learning/catalog.schema.json'), 'utf8'),
) as object;
const addFormats = addFormatsImport as unknown as (instance: Ajv2020) => Ajv2020;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

type Meaning = Readonly<{
  options: readonly Readonly<{ id: string; label: string }>[];
  correctOptionId: string;
}>;

export type LearningCatalogEntry = Readonly<{
  key: string;
  category: string;
  language: 'en' | 'ko' | 'ja' | 'es';
  canonicalAnswer: string;
  hintLadder?: readonly HintStepV1[];
  reviewedHanja?: string;
  hanjaReviewStatus?: 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED';
  meaning: Meaning;
}>;

type LearningCatalog = Readonly<{ entries: readonly LearningCatalogEntry[] }>;

export type HintLadderAdmission = Readonly<{
  status: 'ADMITTED' | 'MISSING' | 'REJECTED';
  stepCount: number;
  errors: readonly string[];
  hash: string | null;
}>;

export type LearningDraftValidationResult = Readonly<{
  structuralOk: boolean;
  publishBlocked: true;
  blocker:
    | 'RIGHTS_NOT_APPROVED'
    | 'EDUCATION_REVIEW_REQUIRED'
    | 'ASSETS_NOT_GENERATED'
    | 'HINT_LADDER_REJECTED';
  rankedEligible: boolean;
  hintLadderAdmission: HintLadderAdmission;
}>;

export type LearningCatalogueHintError = Readonly<{
  instancePath: string;
  keyword: 'hintLadder';
  ruleId: string;
  message: string;
}>;

type LearningCatalogueValidationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; errors: readonly (ErrorObject | LearningCatalogueHintError)[] }>;

const missingAdmission = (): HintLadderAdmission => ({
  status: 'MISSING',
  stepCount: 0,
  errors: ['MISSING_HINT_LADDER'],
  hash: null,
});

function supportedCategory(value: string): value is HintCategory {
  return (
    value === 'ENGLISH' ||
    value === 'PROVERB' ||
    value === 'IDIOM' ||
    value === 'GENERAL_KNOWLEDGE'
  );
}

function validationContext(entry: LearningCatalogEntry): HintLadderValidationContext {
  return {
    ...(entry.reviewedHanja ? { reviewedHanja: entry.reviewedHanja } : {}),
    ...(entry.hanjaReviewStatus
      ? { hanjaReviewStatus: entry.hanjaReviewStatus }
      : {}),
    meaning: entry.meaning,
  };
}

function admitHintLadder(
  entry: LearningCatalogEntry,
  steps: readonly HintStepV1[] | undefined,
): HintLadderAdmission {
  if (!steps) return missingAdmission();
  const errors = supportedCategory(entry.category)
    ? validateHintLadder(
        entry.category,
        entry.canonicalAnswer,
        steps,
        validationContext(entry),
      )
    : ['UNSUPPORTED_HINT_CATEGORY'];
  if (errors.length > 0) {
    return {
      status: 'REJECTED',
      stepCount: steps.length,
      errors,
      hash: null,
    };
  }
  return {
    status: 'ADMITTED',
    stepCount: steps.length,
    errors: [],
    hash: canonicalJsonSha256(steps),
  };
}

export function validateLearningCatalogue(value: unknown): LearningCatalogueValidationResult {
  if (!validate(value)) return { ok: false, errors: validate.errors ?? [] };
  const catalog = value as LearningCatalog;
  const errors: LearningCatalogueHintError[] = [];
  const keys = new Set<string>();

  catalog.entries.forEach((entry, index) => {
    if (keys.has(entry.key)) {
      errors.push({
        instancePath: `/entries/${index}/key`,
        keyword: 'hintLadder',
        ruleId: 'DUPLICATE_CATALOG_KEY',
        message: 'catalogue keys must be unique',
      });
    }
    keys.add(entry.key);
    if (!entry.hintLadder) return;
    for (const ruleId of admitHintLadder(entry, entry.hintLadder).errors) {
      errors.push({
        instancePath: `/entries/${index}/hintLadder`,
        keyword: 'hintLadder',
        ruleId,
        message: 'authored hint ladder failed category admission',
      });
    }
  });

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function admitLearningBundleHintLadder(
  entry: LearningCatalogEntry,
  value: unknown,
): HintLadderAdmission {
  if (!isRecord(value)) {
    return {
      status: 'REJECTED',
      stepCount: 0,
      errors: ['INVALID_LEARNING_BUNDLE'],
      hash: null,
    };
  }
  const publicContent = isRecord(value.publicContent) ? value.publicContent : {};
  const privateSolution = isRecord(value.privateSolution) ? value.privateSolution : {};
  const finalChallenge = isRecord(privateSolution.finalChallenge)
    ? privateSolution.finalChallenge
    : {};
  const steps = Array.isArray(finalChallenge.hintLadder)
    ? (finalChallenge.hintLadder as HintStepV1[])
    : undefined;
  if (!steps) return missingAdmission();
  const admission = admitHintLadder(entry, steps);
  if (admission.status !== 'ADMITTED') return admission;

  const errors: string[] = [];
  if (publicContent.category !== entry.category) errors.push('CATALOG_DRAFT_CATEGORY_MISMATCH');
  if (finalChallenge.canonicalAnswer !== entry.canonicalAnswer) {
    errors.push('CATALOG_DRAFT_ANSWER_MISMATCH');
  }
  const hintUnits = Array.isArray(finalChallenge.hintUnits)
    ? finalChallenge.hintUnits
    : [];
  const expectedUnits = segmentAnswer(entry.canonicalAnswer, entry.language).hintUnits;
  if (JSON.stringify(hintUnits) !== JSON.stringify(expectedUnits)) {
    errors.push('HINT_SEGMENTATION');
  }
  if (
    entry.hintLadder &&
    canonicalJsonSha256(entry.hintLadder) !== canonicalJsonSha256(steps)
  ) {
    errors.push('CATALOG_DRAFT_LADDER_MISMATCH');
  }
  if (errors.length > 0) {
    return {
      status: 'REJECTED',
      stepCount: steps.length,
      errors,
      hash: null,
    };
  }
  return admission;
}

export async function validateLearningDraft(
  key: string,
  draftsRoot = path.join(root, 'content/learning/drafts'),
): Promise<LearningDraftValidationResult> {
  const catalogValue = JSON.parse(
    fs.readFileSync(path.join(root, 'content/learning/catalog.v1.json'), 'utf8'),
  ) as unknown;
  const catalogValidation = validateLearningCatalogue(catalogValue);
  if (!catalogValidation.ok) throw new Error('INVALID_LEARNING_CATALOGUE');
  const catalog = catalogValue as LearningCatalog;
  const entry = catalog.entries.find((candidate) => candidate.key === key);
  if (!entry) throw new Error('UNKNOWN_LEARNING_CATALOGUE_KEY');

  const draft = path.join(draftsRoot, `${key}.json`);
  if (!fs.existsSync(draft)) {
    return {
      structuralOk: false,
      publishBlocked: true,
      blocker: 'ASSETS_NOT_GENERATED',
      rankedEligible: false,
      hintLadderAdmission: missingAdmission(),
    };
  }

  const value = JSON.parse(fs.readFileSync(draft, 'utf8')) as unknown;
  const admission = admitLearningBundleHintLadder(entry, value);
  const reviews = isRecord(value) ? value : {};
  const blocker =
    admission.status === 'REJECTED'
      ? 'HINT_LADDER_REJECTED'
      : reviews.rightsReviewStatus !== 'APPROVED'
        ? 'RIGHTS_NOT_APPROVED'
        : 'EDUCATION_REVIEW_REQUIRED';

  return {
    structuralOk: admission.status !== 'REJECTED',
    publishBlocked: true,
    blocker,
    rankedEligible: admission.status === 'ADMITTED' && admission.hash !== null,
    hintLadderAdmission: admission,
  };
}
