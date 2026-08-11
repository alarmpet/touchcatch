import { describe, expect, it } from 'vitest';
import { buildRankingModel } from './ranking-model';

describe('ranking model', () => {
  it('excludes unverified rows and orders ties deterministically', () => {
    const model = buildRankingModel({ category: 'ENGLISH', enabled: true, rows: [
      { rank: 9, nickname: 'Beta', score: 100, verified: true },
      { rank: 8, nickname: 'Alpha', score: 100, verified: true },
      { rank: 1, nickname: '作弊', score: 999, verified: false },
    ] });
    expect(model.state).toBe('READY');
    expect(model.rows.map((row) => row.nickname)).toEqual(['Alpha', 'Beta']);
  });

  it('disables idiom and general knowledge until policy approval', () => {
    expect(buildRankingModel({ category: 'IDIOM', enabled: true, rows: [] }).state).toBe('DISABLED');
  });

  it('represents loading, network error, and stale server states', () => {
    expect(buildRankingModel({ category: 'ENGLISH', enabled: true, rows: [], requestState: 'LOADING' }).state).toBe('LOADING');
    expect(buildRankingModel({ category: 'ENGLISH', enabled: true, rows: [], requestState: 'ERROR' }).state).toBe('ERROR');
    expect(buildRankingModel({ category: 'ENGLISH', enabled: true, rows: [{ rank: 1, nickname: 'Ada', score: 10, verified: true }], stale: true }).state).toBe('STALE');
  });

  it('excludes non-admitted content and unverified hint penalties', () => {
    const model = buildRankingModel({ category: 'PROVERB', enabled: true, rows: [
      { rank: 1, nickname: 'Safe', score: 80, verified: true, contentAdmitted: true, hintPenaltyVerified: true },
      { rank: 2, nickname: 'Draft', score: 99, verified: true, contentAdmitted: false, hintPenaltyVerified: true },
      { rank: 3, nickname: 'Hint', score: 98, verified: true, contentAdmitted: true, hintPenaltyVerified: false },
    ] });
    expect(model.rows.map((row) => row.nickname)).toEqual(['Safe']);
  });

  it('normalizes privacy-safe nicknames and paginates deterministic rows', () => {
    const model = buildRankingModel({ category: 'ENGLISH', enabled: true, page: 2, pageSize: 1, rows: [
      { rank: 1, nickname: '   ', score: 100, verified: true },
      { rank: 2, nickname: 'VeryLongNicknameThatMustNotLeak', score: 90, verified: true },
    ] });
    expect(model.rows).toEqual([
      expect.objectContaining({ nickname: 'VeryLongNickn…' }),
    ]);
    expect(model.totalRows).toBe(2);
  });
});
