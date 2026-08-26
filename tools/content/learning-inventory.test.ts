import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildLearningInventoryDocument,
  classifyPack,
  evaluateLearningInventory,
  INVENTORY_PATH,
  loadLearningInventoryInputs,
} from './learning-inventory.js';

describe('learning inventory', () => {
  it('admits only manifest packs that are usable and hint-admitted', () => {
    expect(classifyPack({
      inManifest: true, derivedUsable: true, rankedEligible: true, hintLadderStatus: 'ADMITTED',
    })).toEqual({
      decision: 'ADMIT',
      reason: expect.stringContaining('not a publish approval'),
    });
    expect(classifyPack({ inManifest: false, derivedUsable: true, rankedEligible: true, hintLadderStatus: 'ADMITTED' }).decision).toBe('HOLD');
    expect(classifyPack({ inManifest: true, derivedUsable: false, rankedEligible: true, hintLadderStatus: 'ADMITTED' }).decision).toBe('HOLD');
    expect(classifyPack({ inManifest: true, derivedUsable: true, rankedEligible: false, hintLadderStatus: 'MISSING' }).decision).toBe('HOLD');
  });

  it('classifies every draft and source pair and treats unclassified as an error', () => {
    const result = evaluateLearningInventory({
      manifestEntries: [{
        key: 'kept',
        category: 'ENGLISH',
        rankedEligible: true,
        publishBlocked: true,
        hintLadderAdmission: { status: 'ADMITTED' },
      }],
      draftKeys: ['kept', 'geo-paris-eiffel'],
      sourceKeys: ['kept-a', 'kept-b', 'geo-paris-eiffel-a', 'geo-paris-eiffel-b'],
      derivedUsableByKey: { kept: true, 'geo-paris-eiffel': true },
      draftMetaByKey: {
        kept: { category: 'ENGLISH', rightsReviewStatus: 'REVIEW_REQUIRED', educationReviewStatus: 'REVIEW_REQUIRED' },
        'geo-paris-eiffel': { category: 'GENERAL_KNOWLEDGE', rightsReviewStatus: 'REVIEW_REQUIRED', educationReviewStatus: 'REVIEW_REQUIRED' },
      },
    });
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({ total: 2, ADMIT: 1, HOLD: 1, REJECT: 0 });
    expect(result.admit).toEqual(['kept']);
    expect(result.entries.find((entry) => entry.key === 'geo-paris-eiffel')?.decision).toBe('HOLD');
  });

  it('keeps the committed inventory identical to a rebuild from disk', () => {
    const committed = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8')) as ReturnType<typeof buildLearningInventoryDocument>;
    const rebuilt = buildLearningInventoryDocument(loadLearningInventoryInputs());
    expect(committed).toEqual(rebuilt);
    expect(rebuilt.counts.REJECT).toBe(0);
    expect(rebuilt.counts.ADMIT).toBeGreaterThan(0);
    expect(rebuilt.entries.every((entry) => entry.decision === 'ADMIT' || entry.decision === 'HOLD')).toBe(true);
    expect(rebuilt.entries.filter((entry) => entry.decision === 'ADMIT').every((entry) => (
      entry.inManifest
      && entry.publishBlocked
      && entry.derivedUsable
      && (entry.category === 'ENGLISH' || entry.category === 'PROVERB' || entry.category === 'IDIOM')
    ))).toBe(true);
  });
});
