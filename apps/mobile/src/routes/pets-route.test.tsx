import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { PetsRouteView } from '../../app/pets.js';
import { revealDurationMs } from '../features/pets/reveal-model.js';

vi.mock('react-native', () => ({ ScrollView: 'ScrollView', Text: 'Text', View: 'View', Pressable: 'Pressable', Image: 'Image' }));
vi.mock('expo-router', () => ({ Link: 'Link' }));
vi.mock('../runtime/mobile-runtime', () => ({ useMobileRuntime: vi.fn(), useMobileSession: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const progress = (ownedCount: number, totalCount: number) => ({ ownedCount, totalCount });
const collection = {
  claimedToday: true,
  ownedCount: 1,
  totalCount: 50,
  rarityProgress: {
    COMMON: progress(1, 30),
    UNCOMMON: progress(0, 0),
    RARE: progress(0, 15),
    EPIC: progress(0, 0),
    LEGENDARY: progress(0, 5),
  },
  pets: [{
    userPetId: '10000000-0000-4000-8000-000000000001',
    petId: '20000000-0000-4000-8000-000000000001',
    rarity: 'COMMON' as const,
    displayKey: 'pet.common.lion',
    level: 1,
    xp: 0,
    copies: 3,
    selected: false,
    locked: false,
    acquiredAt: null,
    acquisitionDateStatus: 'UNAVAILABLE_LEGACY' as const,
    art: {
      thumbnailUrl: 'https://cdn.example/lion-thumb.png',
      thumbnailSha256: 'a'.repeat(64),
      fullUrl: 'https://cdn.example/lion.png',
      fullSha256: 'b'.repeat(64),
    },
  }],
};

describe('pets live route view', () => {
  it.each(['LOADING', 'SIGNED_OUT', 'DISABLED', 'ERROR'] as const)('renders %s explicitly', (status) => {
    const state = status === 'DISABLED' ? { status, code: 'REWARD_POLICY_NOT_APPROVED' }
      : status === 'ERROR' ? { status, code: 'NETWORK_UNAVAILABLE', retry: 'LOAD' as const }
        : { status };
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PetsRouteView state={state} onClaim={vi.fn()} onPromote={vi.fn()} onRetry={vi.fn()} />); });
    expect(tree.root.findByProps({ accessibilityLabel: `펫 화면 상태 ${status}` })).toBeTruthy();
  });

  it('shows per-tier progress and a promotion countdown without exposing empty admitted tiers', () => {
    const state = { status: 'READY' as const, collection, claimedToday: true, operation: 'IDLE' as const };
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PetsRouteView state={state} onClaim={vi.fn()} onPromote={vi.fn()} onRetry={vi.fn()} />); });
    expect(tree.root.findByProps({ accessibilityLabel: '등급별 수집 진행도' })).toBeTruthy();
    expect(tree.root.findAllByProps({ accessibilityLabel: '일반 진행도 1/30' })).toHaveLength(1);
    // UNCOMMON and EPIC hold no admitted art, so they must not render as 0% rows.
    expect(tree.root.findAllByProps({ accessibilityLabel: '고급 진행도 0/0' })).toHaveLength(0);
    // The countdown is a meter now, so it names the tier being climbed to and carries the
    // fill alongside the number. "8 more" on its own never said 8 more toward what.
    expect(tree.root.findAllByProps({ accessibilityLabel: 'pet.common.lion 고급 승급까지 8개, 3/11' })).toHaveLength(1);
  });

  it('holds the reveal closed until the sequence finishes and then dismisses it', async () => {
    vi.useFakeTimers();
    const onDismissReveal = vi.fn();
    const state = {
      status: 'READY' as const,
      collection,
      claimedToday: true,
      operation: 'IDLE' as const,
      reveal: {
        source: 'DAILY_DRAW' as const,
        petId: '20000000-0000-4000-8000-000000000001',
        rarity: 'LEGENDARY' as const,
        copies: 1,
        isFirstCopy: true,
      },
    };
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PetsRouteView state={state} onClaim={vi.fn()} onPromote={vi.fn()} onRetry={vi.fn()} onDismissReveal={onDismissReveal} />); });

    expect(tree.root.findByProps({ testID: 'reveal-pending' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: '획득 결과 닫기' }).props.disabled).toBe(true);

    // Driven from the model rather than a fixed 1000: a LEGENDARY climbs the whole rarity
    // ladder before it settles, so the wait belongs to the tier, not to this test.
    await act(async () => { vi.advanceTimersByTime(revealDurationMs('LEGENDARY')); });

    expect(tree.root.findAllByProps({ testID: 'reveal-pending' })).toHaveLength(0);
    const close = tree.root.findByProps({ accessibilityLabel: '획득 결과 닫기' });
    expect(close.props.disabled).toBe(false);
    act(() => close.props.onPress());
    expect(onDismissReveal).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
