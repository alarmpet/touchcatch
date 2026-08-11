export type ApprovalGroup = 'PET_ECONOMY_V1' | 'DAILY_PET_LOOP_V1' | 'WEEKLY_COMPETITION_V1' | 'PET_RUNTIME_ART_V1';
export function artifactSha256(value: unknown): string;
export function signableApprovalRecord(value: unknown): string;
export function approvalGroupIsVerified(input: unknown, group: ApprovalGroup): boolean;
export function runtimeArtSourcesAreApproved(input: unknown): boolean;
export function runtimeArtAssetsAreVerified(input: unknown): boolean;
export function runtimeArtRightsEvidenceIsApproved(input: unknown): boolean;
export function evaluatePetRuntimeApproval(input: unknown): Readonly<{ status: 'APPROVED' | 'BLOCKED'; blockers: readonly Readonly<{ code: string; detail: string }>[] }>;
export function evaluateRepository(root?: string): ReturnType<typeof evaluatePetRuntimeApproval>;
