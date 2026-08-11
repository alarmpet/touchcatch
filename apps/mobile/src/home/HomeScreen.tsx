import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { PublicHomeModel, PublicHomeCard } from './home-model';
import { colors, radius, spacing } from '../ui/design-tokens';

function Shortcut({ card }: Readonly<{ card: PublicHomeCard }>) {
  const disabled = card.availability !== 'ENABLED';
  const content = <View style={{ width: 142, minHeight: 94, padding: spacing.md, borderRadius: radius.card, backgroundColor: disabled ? '#E8EEF4' : colors.white, borderWidth: 1, borderColor: colors.line }}>
    <Text style={{ fontSize: 24 }}>{card.id === 'pets' ? '🐾' : card.id === 'ranking' ? '🏆' : '🧩'}</Text>
    <Text style={{ marginTop: spacing.sm, color: colors.ink, fontSize: 14, fontWeight: '800' }}>{card.label}</Text>
    {disabled && <Text style={{ marginTop: 4, color: colors.muted, fontSize: 11 }}>준비 중</Text>}
  </View>;
  if (disabled) return <View>{content}</View>;
  return <Link href={card.route as never} asChild><Pressable accessibilityRole="button" accessibilityLabel={card.label}>{content}</Pressable></Link>;
}

export function HomeScreen({ model }: Readonly<{ model: PublicHomeModel }>) {
  const [primary, ...shortcuts] = model.cards;
  return <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32, backgroundColor: colors.canvas }}>
    <View style={{ marginTop: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View><Text style={{ color: colors.muted, fontSize: 14 }}>오늘도 가볍게 시작해요</Text><Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 30, fontWeight: '900' }}>TouchCatch</Text></View>
      <View accessibilityLabel="연속 학습 0일" style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: '#FFF4D6' }}><Text>🔥 0일</Text></View>
    </View>
    <View style={{ marginTop: spacing.xl, padding: spacing.xl, borderRadius: radius.card, backgroundColor: colors.sky, minHeight: 190, justifyContent: 'space-between' }}>
      <View><Text style={{ color: '#DFF2FF', fontSize: 13, fontWeight: '700' }}>TODAY'S PLAYBOOK · 약 3분</Text><Text style={{ marginTop: 8, color: colors.white, fontSize: 25, fontWeight: '900' }}>그림을 찾고{`\n`}단어를 잡아보세요</Text></View>
      <Link href="/game/spot-difference" asChild><Pressable accessibilityRole="button" accessibilityLabel="오늘의 학습 시작" style={{ alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.button, backgroundColor: colors.sun }}><Text style={{ color: colors.ink, fontWeight: '900' }}>오늘의 학습 시작  →</Text></Pressable></Link>
    </View>
    <Text style={{ marginTop: spacing.xl, marginBottom: spacing.sm, color: colors.ink, fontSize: 19, fontWeight: '900' }}>빠른 이동</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>{shortcuts.map((card) => <Shortcut key={card.id} card={card} />)}</ScrollView>
    <View style={{ marginTop: spacing.xl, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>RECENT ACHIEVEMENT</Text><Text style={{ marginTop: 6, color: colors.ink, fontSize: 16, fontWeight: '800' }}>첫 학습 세션을 완료하면 여기에 기록돼요.</Text></View>
    <View style={{ marginTop: spacing.xl, padding: 8, borderRadius: radius.card, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', justifyContent: 'space-around' }}>
      <NavItem route="/" icon="⌂" label="홈" /><NavItem route="/pets" icon="🐾" label="펫" /><NavItem route="/ranking" icon="🏆" label="랭킹" /><NavItem route="/profile" icon="●" label="내 정보" />
    </View>
  </ScrollView>;
}

function NavItem({ route, icon, label }: { route: string; icon: string; label: string }) { return <Link href={route as never} asChild><Pressable accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', minWidth: 58, padding: 8 }}><Text style={{ fontSize: 20 }}>{icon}</Text><Text style={{ marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: '700' }}>{label}</Text></Pressable></Link>; }
