import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJsonSha256 } from '../../contracts/src/canonical-json.js';
import {
  admitLearningBundleHintLadder,
  validateLearningCatalogue,
  validateLearningDraft,
} from './validate-learning-draft.js';

const cataloguePath = 'content/learning/catalog.v1.json';
const admittedKeys = [
  'en-resilience',
  'ko-proverb-seeing-is-believing',
  'ko-idiom-turn-misfortune',
] as const;

function representativeAdmissionPair() {
  const catalog = JSON.parse(fs.readFileSync(cataloguePath, 'utf8')) as {
    entries: Array<Record<string, unknown> & { key: string }>;
  };
  const entry = structuredClone(
    catalog.entries.find((candidate) => candidate.key === 'en-resilience')!,
  );
  const bundle = JSON.parse(
    fs.readFileSync('content/learning/drafts/en-resilience.json', 'utf8'),
  ) as Record<string, any>;
  return { entry, bundle: structuredClone(bundle) };
}

function rehashPrivateSolution(bundle: Record<string, any>): void {
  const { privateSolutionHash: _ignored, ...body } = bundle.privateSolution;
  bundle.privateSolution.privateSolutionHash = canonicalJsonSha256(body);
}

describe('learning draft hint admission boundary', () => {
  it('accepts the expanded production catalogue without freezing an obsolete key list', () => {
    const catalog = JSON.parse(fs.readFileSync(cataloguePath, 'utf8')) as {
      entries: Array<{ category: string; status: string }>;
    };

    expect(validateLearningCatalogue(catalog)).toEqual({ ok: true });
    const categoryCounts = Object.fromEntries(
      ['ENGLISH', 'PROVERB', 'IDIOM', 'GENERAL_KNOWLEDGE'].map((category) => [
        category,
        catalog.entries.filter((entry) => entry.category === category).length,
      ]),
    );
    expect(categoryCounts).toMatchObject({
      ENGLISH: expect.any(Number),
      PROVERB: expect.any(Number),
      IDIOM: expect.any(Number),
      GENERAL_KNOWLEDGE: expect.any(Number),
    });
    expect(categoryCounts.ENGLISH).toBeGreaterThanOrEqual(70);
    expect(categoryCounts.PROVERB).toBeGreaterThanOrEqual(4);
    expect(categoryCounts.IDIOM).toBeGreaterThanOrEqual(4);
    expect(categoryCounts.GENERAL_KNOWLEDGE).toBeGreaterThanOrEqual(1);
    expect(catalog.entries.every((entry) => entry.status === 'DRAFT')).toBe(true);
  });

  it('carries exactly five authored steps on a representative category set', () => {
    const catalog = JSON.parse(fs.readFileSync(cataloguePath, 'utf8')) as {
      entries: Array<{ key: string; hintLadder?: unknown[]; reviewedHanja?: string }>;
    };

    for (const key of admittedKeys) {
      const entry = catalog.entries.find((candidate) => candidate.key === key);
      expect(entry?.hintLadder, key).toHaveLength(5);
    }
    expect(
      catalog.entries.find((entry) => entry.key === 'ko-idiom-turn-misfortune')
        ?.reviewedHanja,
    ).toBeUndefined();
  });

  it('records an immutable ladder hash and ranked eligibility for an admitted draft', async () => {
    const result = await validateLearningDraft('en-resilience');

    expect(result).toMatchObject({
      structuralOk: true,
      publishBlocked: true,
      blocker: 'RIGHTS_NOT_APPROVED',
      rankedEligible: true,
      hintLadderAdmission: {
        status: 'ADMITTED',
        stepCount: 5,
        errors: [],
        hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
  });

  it('keeps a legacy bundle without five admitted steps out of ranked eligibility', async () => {
    const result = await validateLearningDraft('en-dilemma');

    expect(result).toMatchObject({
      structuralOk: true,
      publishBlocked: true,
      rankedEligible: false,
      hintLadderAdmission: {
        status: 'MISSING',
        stepCount: 0,
        errors: ['MISSING_HINT_LADDER'],
        hash: null,
      },
    });
  });

  it('requires generated assets before draft validation', async () => {
    const emptyDrafts = fs.mkdtempSync(path.join(tmpdir(), 'learning-drafts-'));
    try {
      const result = await validateLearningDraft('en-resilience', emptyDrafts);
      expect(result).toEqual({
        structuralOk: false,
        publishBlocked: true,
        blocker: 'ASSETS_NOT_GENERATED',
        rankedEligible: false,
        hintLadderAdmission: {
          status: 'MISSING',
          stepCount: 0,
          errors: ['MISSING_HINT_LADDER'],
          hash: null,
        },
      });
    } finally {
      fs.rmSync(emptyDrafts, { recursive: true, force: true });
    }
  });

  it('rejects catalogue drift and category-invalid authored ladders', () => {
    const catalog = JSON.parse(fs.readFileSync(cataloguePath, 'utf8')) as {
      entries: Array<Record<string, unknown> & { key: string; hintLadder?: unknown[] }>;
    };
    expect(
      validateLearningCatalogue({
        ...catalog,
        entries: catalog.entries.map((entry) =>
          entry.key === 'en-resilience' ? { ...entry, status: 'APPROVED' } : entry,
        ),
      }),
    ).toMatchObject({ ok: false });

    const invalid = {
      ...catalog,
      entries: catalog.entries.map((entry) =>
        entry.key === 'en-resilience'
          ? {
              ...entry,
              hintLadder: entry.hintLadder?.map((step, index) =>
                index === 1
                  ? {
                      ...(step as Record<string, unknown>),
                      localizedText: {
                        ko: '빈칸이 없는 문장이에요.',
                        en: 'This sentence has no blank.',
                      },
                    }
                  : step,
              ),
            }
          : entry,
      ),
    };
    const result = validateLearningCatalogue(invalid);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'ENGLISH_CONTEXT_BLANK' }),
        ]),
      );
    }
  });

  it('rejects a draft-authored ladder when the authoritative catalog has none', () => {
    const { entry, bundle } = representativeAdmissionPair();
    delete entry.hintLadder;

    expect(admitLearningBundleHintLadder(entry as never, bundle)).toMatchObject({
      status: 'REJECTED',
      errors: expect.arrayContaining(['CATALOG_HINT_LADDER_MISSING']),
      hash: null,
    });
  });

  it('rejects an authoritative catalog ladder missing from the draft', () => {
    const { entry, bundle } = representativeAdmissionPair();
    delete bundle.privateSolution.finalChallenge.hintLadder;
    rehashPrivateSolution(bundle);

    expect(admitLearningBundleHintLadder(entry as never, bundle)).toMatchObject({
      status: 'REJECTED',
      errors: expect.arrayContaining(['DRAFT_HINT_LADDER_MISSING']),
      hash: null,
    });
  });

  it.each([
    ['stale private hash', (bundle: Record<string, any>) => {
      bundle.privateSolution.privateSolutionHash = '0'.repeat(64);
    }, 'PRIVATE_SOLUTION_HASH_MISMATCH'],
    ['private schema drift', (bundle: Record<string, any>) => {
      bundle.privateSolution.finalChallenge.unexpected = true;
      rehashPrivateSolution(bundle);
    }, 'PRIVATE_SOLUTION_SCHEMA_INVALID'],
    ['meaning option order drift', (bundle: Record<string, any>) => {
      bundle.privateSolution.finalChallenge.meaning.options.reverse();
      rehashPrivateSolution(bundle);
    }, 'CATALOG_DRAFT_MEANING_MISMATCH'],
    ['correct option drift', (bundle: Record<string, any>) => {
      bundle.privateSolution.finalChallenge.meaning.correctOptionId = 'option_2';
      rehashPrivateSolution(bundle);
    }, 'CATALOG_DRAFT_MEANING_MISMATCH'],
    ['Hanja evidence drift', (bundle: Record<string, any>) => {
      bundle.privateSolution.finalChallenge.reviewedHanja = '轉禍爲福';
      bundle.privateSolution.finalChallenge.hanjaReviewStatus = 'APPROVED';
      rehashPrivateSolution(bundle);
    }, 'CATALOG_DRAFT_HANJA_MISMATCH'],
    ['ladder penalty drift', (bundle: Record<string, any>) => {
      bundle.privateSolution.finalChallenge.hintLadder[0].rankedPenaltyUnits = 2;
      rehashPrivateSolution(bundle);
    }, 'INVALID_RANKED_PENALTY'],
  ])('rejects %s at ranked admission', (_label, mutate, expected) => {
    const { entry, bundle } = representativeAdmissionPair();
    mutate(bundle);

    expect(admitLearningBundleHintLadder(entry as never, bundle)).toMatchObject({
      status: 'REJECTED',
      errors: expect.arrayContaining([expected]),
      hash: null,
    });
  });

  it('hashes the complete verified semantic envelope, including private hash', () => {
    const { entry, bundle } = representativeAdmissionPair();
    const admitted = admitLearningBundleHintLadder(entry as never, bundle);
    const originalHash = admitted.hash;

    bundle.privateSolution.differences[0].hitboxes.imageA.cx += 0.001;
    rehashPrivateSolution(bundle);
    const repinned = admitLearningBundleHintLadder(entry as never, bundle);

    expect(admitted.status).toBe('ADMITTED');
    expect(repinned.status).toBe('ADMITTED');
    expect(repinned.hash).not.toBe(originalHash);
  });
});
