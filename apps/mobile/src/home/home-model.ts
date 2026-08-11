export type HomeAvailability = 'ENABLED' | 'SERVER_UNAVAILABLE' | 'POLICY_DRAFT' | 'CONTENT_NOT_ADMITTED' | 'CATEGORY_DISABLED_FOR_RANKED';
export type PublicHomeCard = Readonly<{ id: 'spot-difference' | 'pets' | 'ranking'; label: string; route: string; availability: HomeAvailability; reason?: string }>;
export type PublicHomeModel = Readonly<{ cards: readonly PublicHomeCard[] }>;
export function buildHomeModel(input: Readonly<{ hasAdmittedContent: boolean; serverAvailable: boolean; rewardPolicy: 'DRAFT' | 'APPROVED'; rankingEnabled: boolean }>): PublicHomeModel {
  const content = input.hasAdmittedContent ? 'ENABLED' : 'CONTENT_NOT_ADMITTED';
  return { cards: [
    { id: 'spot-difference', label: '그림·초성·스펠링 학습 게임', route: '/game/spot-difference', availability: content },
    { id: 'pets', label: '펫 보상', route: '/pets', availability: input.serverAvailable && input.rewardPolicy === 'APPROVED' ? 'ENABLED' : input.rewardPolicy === 'DRAFT' ? 'POLICY_DRAFT' : 'SERVER_UNAVAILABLE' },
    { id: 'ranking', label: '랭킹', route: '/ranking', availability: input.serverAvailable && input.rankingEnabled ? 'ENABLED' : input.rankingEnabled ? 'SERVER_UNAVAILABLE' : 'CATEGORY_DISABLED_FOR_RANKED' },
  ] };
}
