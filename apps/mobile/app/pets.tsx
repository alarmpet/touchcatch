import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { PetCollection } from '../src/features/pets/PetCollection';
import { DailyFreeDraw } from '../src/features/pets/DailyFreeDraw';
import { createPetsRouteController, type PetsRouteState } from '../src/features/pets/pets-route-controller';
import { colors, radius, spacing } from '../src/ui/design-tokens';
import { useMobileRuntime, useMobileSession } from '../src/runtime/mobile-runtime';

export function PetsRouteView({ state, onClaim, onPromote, onRetry }: Readonly<{
  state: PetsRouteState;
  onClaim(): void;
  onPromote(petId: string): void;
  onRetry(): void;
}>) {
  const body = (() => {
    if (state.status === 'LOADING') return <PetCollection status="LOADING" pets={[]} totalCatalogCount={0} />;
    if (state.status === 'SIGNED_OUT') return <Message title="로그인이 필요해요" detail="내 펫을 안전하게 불러오려면 내 정보에서 로그인해 주세요." />;
    if (state.status === 'DISABLED') return <><Message title="펫 보상 준비 중" detail="승인된 보상 정책과 펫 아트가 활성화되면 열려요." /><DailyFreeDraw hasClaimedToday={false} policy="DRAFT" /></>;
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
      <DailyFreeDraw hasClaimedToday={state.claimedToday} policy="APPROVED" onClaimDraw={onClaim} />
      <PetCollection status={state.status === 'EMPTY' ? 'EMPTY' : 'READY'} totalCatalogCount={state.collection.totalCount} pets={pets} onPromotePet={onPromote} />
      {state.operation !== 'IDLE' && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{state.operation === 'CLAIMING' ? '오늘의 펫을 받고 있어요.' : '펫을 승급하고 있어요.'}</Text>}
    </>;
  })();
  return <ScrollView accessibilityLabel={`펫 화면 상태 ${state.status}`} contentContainerStyle={{ padding: spacing.lg, backgroundColor: colors.canvas, flexGrow: 1 }}>
    <Text accessibilityRole="header" style={{ marginTop: 18, color: colors.ink, fontSize: 28, fontWeight: '900' }}>펫 보상</Text>
    <Text style={{ marginTop: 6, color: colors.muted }}>학습을 완료하고 만난 친구를 모아 보세요.</Text>
    <View style={{ marginTop: spacing.xl }}>{body}</View>
  </ScrollView>;
}

function Message({ title, detail, action, onAction }: Readonly<{ title: string; detail: string; action?: string; onAction?: () => void }>) {
  return <View style={{ padding: spacing.xl, borderRadius: radius.card, backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1 }}>
    <Text style={{ color: colors.ink, fontSize: 19, fontWeight: '900' }}>{title}</Text><Text style={{ marginTop: 8, color: colors.muted, lineHeight: 21 }}>{detail}</Text>
    {action && <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={{ marginTop: spacing.md, padding: 12, borderRadius: radius.button, backgroundColor: colors.sky }}><Text style={{ color: colors.white, textAlign: 'center', fontWeight: '800' }}>{action}</Text></Pressable>}
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
  return <PetsRouteView state={visibleState} onClaim={() => void controller?.claimDaily()} onPromote={(petId) => void controller?.promote(petId)} onRetry={retry} />;
}
