export type HomeAvailability = 'ENABLED' | 'SERVER_UNAVAILABLE' | 'POLICY_DRAFT' | 'CONTENT_NOT_ADMITTED' | 'CATEGORY_DISABLED_FOR_RANKED';
export type PublicHomeCard = Readonly<{ id: 'spot-difference' | 'pets' | 'ranking'; label: string; route: string; availability: HomeAvailability; reason?: string }>;
/**
 * Public collection summary for the home screen. Carries only what the 도감 already shows
 * publicly — never inventory internals, acquisition history or subject identifiers.
 */
export type PublicHomeCollection = Readonly<{
  ownedCount: number;
  totalCount: number;
  showcase: readonly Readonly<{ petId: string; displayKey: string; rarity: string; thumbnailUrl: string }>[];
}>;
export type PublicHomeModel = Readonly<{ cards: readonly PublicHomeCard[]; collection?: PublicHomeCollection }>;
export function buildHomeModel(input: Readonly<{ hasAdmittedContent: boolean; serverAvailable: boolean; rewardPolicy: 'DRAFT' | 'APPROVED'; rankingEnabled: boolean }>): PublicHomeModel {
  const content = input.hasAdmittedContent ? 'ENABLED' : 'CONTENT_NOT_ADMITTED';
  return { cards: [
    { id: 'spot-difference', label: '그림·초성·스펠링 학습 게임', route: '/game/spot-difference', availability: content },
    { id: 'pets', label: '펫 보상', route: '/pets', availability: input.serverAvailable && input.rewardPolicy === 'APPROVED' ? 'ENABLED' : input.rewardPolicy === 'DRAFT' ? 'POLICY_DRAFT' : 'SERVER_UNAVAILABLE' },
    { id: 'ranking', label: '랭킹', route: '/ranking', availability: input.serverAvailable && input.rankingEnabled ? 'ENABLED' : input.rankingEnabled ? 'SERVER_UNAVAILABLE' : 'CATEGORY_DISABLED_FOR_RANKED' },
  ] };
}
