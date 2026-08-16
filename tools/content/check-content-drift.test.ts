import { describe, expect, it } from 'vitest';
import { evaluateContentDrift } from './check-content-drift.js';

describe('content drift checker', () => {
  const manifestEntries = [{ key: 'alpha' }, { key: 'beta' }];

  it('reports missing generated inputs as errors and orphan drafts as warnings', () => {
    const result = evaluateContentDrift({
      manifestEntries,
      draftKeys: ['alpha', 'orphan'],
      sourceKeys: ['alpha-a', 'alpha-b'],
      registrySource: 'const alpha = {"key":"alpha"};',
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'MISSING_DRAFT:beta',
      'MISSING_REGISTRY_ENTRY:beta',
      'MISSING_SOURCE_PAIR:beta',
    ]);
    expect(result.warnings).toEqual(['ORPHAN_DRAFT:orphan']);
  });

  it('passes an exact manifest/draft/source/registry set', () => {
    const result = evaluateContentDrift({
      manifestEntries,
      draftKeys: ['alpha', 'beta'],
      sourceKeys: ['alpha-a', 'alpha-b', 'beta-a', 'beta-b'],
      registrySource: '{"key":"alpha"}{"key":"beta"}',
    });

    expect(result).toMatchObject({ ok: true, errors: [], warnings: [] });
    expect(result.counts).toEqual({ manifest: 2, drafts: 2, sourcePairs: 2, registry: 2 });
  });

  it('blocks ranked entries without an admitted hint ladder', () => {
    const result = evaluateContentDrift({
      manifestEntries: [{ key: 'alpha', rankedEligible: true, hintLadderAdmission: { status: 'PENDING' } }],
      draftKeys: ['alpha'],
      sourceKeys: ['alpha-a', 'alpha-b'],
      registrySource: '{"key":"alpha"}',
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(['INVALID_ADMISSION:alpha']);
  });
});
