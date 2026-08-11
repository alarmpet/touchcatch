export type RankedCategory = 'ENGLISH' | 'PROVERB';
export type RankingRow = Readonly<{
  rank: number;
  nickname: string;
  score: number;
  verified: boolean;
  contentAdmitted?: boolean;
  hintPenaltyVerified?: boolean;
}>;
export type RankingState = 'LOADING' | 'READY' | 'EMPTY' | 'STALE' | 'ERROR' | 'DISABLED';
export type RankingModel = Readonly<{
  state: RankingState;
  rows: readonly RankingRow[];
  totalRows: number;
}>;

function privacySafeNickname(value: string): string {
  const normalized = value.replace(/[\u0000-\u001F\u007F]/gu, '').trim();
  if (!normalized) return '익명 학습자';
  const characters = [...normalized];
  return characters.length > 13 ? `${characters.slice(0, 13).join('')}…` : normalized;
}

export function buildRankingModel(input: {
  category: string;
  rows: readonly RankingRow[];
  enabled: boolean;
  requestState?: 'LOADING' | 'SUCCESS' | 'ERROR';
  stale?: boolean;
  page?: number;
  pageSize?: number;
}): RankingModel {
  if (!input.enabled || !['ENGLISH', 'PROVERB'].includes(input.category)) {
    return { state: 'DISABLED', rows: [], totalRows: 0 };
  }
  if (input.requestState === 'LOADING') return { state: 'LOADING', rows: [], totalRows: 0 };
  if (input.requestState === 'ERROR') return { state: 'ERROR', rows: [], totalRows: 0 };

  const eligibleRows = input.rows
    .filter(
      (row) =>
        row.verified &&
        row.contentAdmitted !== false &&
        row.hintPenaltyVerified !== false,
    )
    .map((row) => ({ ...row, nickname: privacySafeNickname(row.nickname) }))
    .sort((a, b) => a.rank - b.rank || a.nickname.localeCompare(b.nickname));
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, input.pageSize ?? 50);
  const rows = eligibleRows.slice((page - 1) * pageSize, page * pageSize);
  const state = input.stale ? 'STALE' : rows.length ? 'READY' : 'EMPTY';
  return { state, rows, totalRows: eligibleRows.length };
}
