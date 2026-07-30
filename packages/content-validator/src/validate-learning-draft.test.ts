import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  validateLearningCatalogue,
  validateLearningDraft,
} from './validate-learning-draft.js';

const cataloguePath = 'content/learning/catalog.v1.json';
const admittedKeys = [
  'en-resilience',
  'ko-proverb-seeing-is-believing',
  'ko-idiom-turn-misfortune',
] as const;

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
});
