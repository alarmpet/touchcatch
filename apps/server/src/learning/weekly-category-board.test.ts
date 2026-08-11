import { describe, expect, it } from 'vitest';
import { PostgresWeeklyCategoryBoard } from './weekly-category-board.js';

describe('PostgresWeeklyCategoryBoard', () => {
  it('calls the restricted aggregate and strictly parses public DTOs', async () => {
    const rpc = { call: async () => ({ seasonId: '30000000-0000-4000-8000-000000000001', category: 'ENGLISH', snapshotRevision: 'snapshot-1', rows: [{ rank: 1, nickname: 'One', displayScore: 500 }], myRank: { rank: 1, totalCompetitors: 1, percentile: 100, displayScore: 500 } }) };
    await expect(new PostgresWeeklyCategoryBoard(rpc).read({ subjectKey: '40000000-0000-4000-8000-000000000001', seasonId: '30000000-0000-4000-8000-000000000001', category: 'ENGLISH', limit: 10 })).resolves.toMatchObject({ snapshotRevision: 'snapshot-1' });
  });

  it('rejects private fields returned by a compromised adapter', async () => {
    const rpc = { call: async () => ({ seasonId: '30000000-0000-4000-8000-000000000001', category: 'ENGLISH', snapshotRevision: 'x', rows: [{ rank: 1, nickname: 'One', displayScore: 1, subjectKey: 'private' }], myRank: null }) };
    await expect(new PostgresWeeklyCategoryBoard(rpc).read({ subjectKey: 'x', seasonId: '30000000-0000-4000-8000-000000000001', category: 'ENGLISH', limit: 10 })).rejects.toThrow();
  });
});
