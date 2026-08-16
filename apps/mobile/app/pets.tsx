import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { PetCollection } from '../src/features/pets/PetCollection';
import { PetReveal } from '../src/features/pets/PetReveal';
import { DailyFreeDraw } from '../src/features/pets/DailyFreeDraw';
import { createPetsRouteController, type PetsRouteState } from '../src/features/pets/pets-route-controller';
import { colors, spacing } from '../src/ui/design-tokens';
import { buttonStyle, buttonTextStyle, screen, surface, text } from '../src/ui/ui-kit';
import { VividScreenHeader } from '../src/ui/atoms';
import { LockedPetSlots } from '../src/ui/LockedPetSlots';
import { TabBar } from '../src/ui/TabBar';
import { useMobileRuntime, useMobileSession } from '../src/runtime/mobile-runtime';

export function PetsRouteView({ state, onClaim, onPromote, onRetry, onDismissReveal }: Readonly<{
  state: PetsRouteState;
  onClaim(): void;
  onPromote(petId: string): void;
  onRetry(): void;
  onDismissReveal?(): void;
}>) {
  const body = (() => {
    if (state.status === 'LOADING') return <PetCollection status="LOADING" pets={[]} totalCatalogCount={0} />;
    if (state.status === 'SIGNED_OUT') return <Message preview title="로그인하면 펫을 모을 수 있어요" detail="학습을 마칠 때마다 친구가 하나씩 늘어나요. 내 정보에서 로그인해 주세요." />;
    if (state.status === 'DISABLED') return <><Message preview title="펫 보상 준비 중" detail="승인된 보상 정책과 펫 아트가 활성화되면 열려요." /><DailyFreeDraw hasClaimedToday={false} policy="DRAFT" /></>;
    if (state.status === 'ERROR') return <Message title="펫 정보를 불러오지 못했어요" detail="연결을 확인하고 다시 시도해 주세요." action="다시 시도" onAction={onRetry} />;
    const pets = state.collection.pets.map((pet) => ({
      id: pet.petId,
      name: pet.displayKey,
      rarity: pet.rarity,
      ownedCopies: pet.copies,
      selected: pet.selected,
      locked: pet.locked,
      artUrl: pet.art.thumbnailUrl,
    }));
    return <>
      {state.reveal ? <PetReveal reveal={state.reveal} onDismiss={() => onDismissReveal?.()} /> : null}
      <DailyFreeDraw hasClaimedToday={state.claimedToday} policy="APPROVED" onClaimDraw={onClaim} />
      <PetCollection status={state.status === 'EMPTY' ? 'EMPTY' : 'READY'} totalCatalogCount={state.collection.totalCount} pets={pets} rarityProgress={state.collection.rarityProgress} onPromotePet={onPromote} />
      {state.operation !== 'IDLE' && <Text accessibilityLiveRegion="polite" style={text.caption}>{state.operation === 'CLAIMING' ? '오늘의 펫을 받고 있어요.' : '펫을 승급하고 있어요.'}</Text>}
    </>;
  })();
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>
    <ScrollView accessibilityLabel={`펫 화면 상태 ${state.status}`} style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ ...screen.scroll, ...screen.content }}>
      <VividScreenHeader tone="collection" eyebrow="COLLECTION" title="펫 보상" lede="학습을 완료하고 만난 친구를 모아 보세요." />
      <View style={{ gap: spacing.sm }}>{body}</View>
    </ScrollView>
    <TabBar active="pets" />
  </View>;
}

function Message({ title, detail, action, onAction, preview = false }: Readonly<{
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
  /** Draws the collection the player does not have yet above the message. */
  preview?: boolean;
}>) {
  return <View style={{ ...surface.card, gap: spacing.md }}>
    {/* A screen that is empty *because you have not started* and one that is empty *because
        something broke* should not look the same. Only the former gets the preview. */}
    {preview ? <LockedPetSlots count={8} columns={4} /> : null}
    <View style={{ gap: 6 }}>
      <Text style={text.subtitle}>{title}</Text>
      <Text style={text.caption}>{detail}</Text>
    </View>
    {action && <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={buttonStyle('primary', { block: true })}><Text style={buttonTextStyle('primary')}>{action}</Text></Pressable>}
  </View>;
}

export default function PetsRoute() {
  const runtime = useMobileRuntime();
  const session = useMobileSession(runtime);
  const controller = useMemo(() => runtime.status === 'READY' ? createPetsRouteController({
    session: () => runtime.session.getState().status,
    api: runtime.pets,
    createKey: runtime.createMutationKey,
  }) : null, [runtime]);
  const fallback: PetsRouteState = { status: 'ERROR', code: runtime.status === 'CONFIG_ERROR' ? runtime.code : 'MOBILE_RUNTIME_UNAVAILABLE', retry: 'LOAD' };
  const state = useSyncExternalStore(
    (listener) => controller?.subscribe(listener) ?? (() => undefined),
    () => controller?.getState() ?? fallback,
  );
  useEffect(() => {
    if (session.status !== 'loading') void controller?.load();
  }, [controller, session.status]);
  useEffect(() => () => controller?.dispose(), [controller]);
  const visibleState: PetsRouteState = session.status === 'loading' ? { status: 'LOADING' }
    : session.status !== 'signed-in' && runtime.status === 'READY' ? { status: 'SIGNED_OUT' }
      : state;
  const retry = () => {
    if (!controller) return;
    if (state.status === 'ERROR' && state.retry === 'CLAIM') void controller.claimDaily();
    else if (state.status === 'ERROR' && state.retry === 'PROMOTION' && state.petId) void controller.promote(state.petId);
    else void controller.load();
  };
  return <PetsRouteView
    state={visibleState}
    onClaim={() => void controller?.claimDaily()}
    onPromote={(petId) => void controller?.promote(petId)}
    onRetry={retry}
    onDismissReveal={() => controller?.dismissReveal()}
  />;
}
