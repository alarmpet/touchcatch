import React from 'react';
import { Image, View, Text, Pressable, ScrollView } from 'react-native';

export type PetItem = {
  id: string;
  name: string;
  rarity: 'COMMON' | 'RARE' | 'LEGENDARY';
  ownedCopies: number;
  selected?: boolean;
  locked?: boolean;
  artUrl?: string;
};
export type PetCollectionProps = {
  pets: PetItem[];
  totalCatalogCount: number;
  status?: 'READY' | 'LOADING' | 'EMPTY' | 'ERROR';
  onPromotePet?: (petId: string) => void;
};

export function PetCollection({ pets, totalCatalogCount, status = pets.length ? 'READY' : 'EMPTY', onPromotePet }: PetCollectionProps) {
  if (status === 'LOADING') return <View accessibilityLabel="펫 컬렉션 로딩 중"><Text>펫 컬렉션을 불러오는 중이에요.</Text></View>;
  if (status === 'ERROR') return <View accessibilityLabel="펫 컬렉션 오류"><Text>펫 컬렉션을 불러오지 못했어요.</Text></View>;
  if (status === 'EMPTY' || pets.length === 0) return <View accessibilityLabel="펫 컬렉션 비어 있음"><Text>아직 보유한 펫이 없어요.</Text></View>;
  const groupedPets = groupInventoryRows(pets);
  const ownedCount = groupedPets.length;
  const completionPercentage = totalCatalogCount ? Math.round((ownedCount / totalCatalogCount) * 100) : 0;
  return <View style={{ padding: 14, backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginVertical: 8 }}>
    <Text style={{ fontSize: 16, fontWeight: '700', color: '#17324D' }}>펫 컬렉션</Text>
    <Text accessibilityLabel="펫 수집률" style={{ fontSize: 14, color: '#0B7A75' }}>수집률 {completionPercentage}% ({ownedCount}/{totalCatalogCount})</Text>
    <ScrollView horizontal style={{ marginTop: 12 }}>{groupedPets.map((pet) => <View key={pet.id} accessibilityLabel={`${pet.name} 펫 카드`} style={{ width: 110, padding: 8, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6, marginRight: 8, alignItems: 'center' }}>
      {pet.artUrl && <Image accessibilityLabel={`${pet.name} 펫 이미지`} source={{ uri: pet.artUrl }} resizeMode="cover" style={{ width: 72, height: 72, borderRadius: 18, marginBottom: 8 }} />}
      <Text style={{ fontWeight: 'bold', color: '#17324D' }}>{pet.name}</Text><Text style={{ color: '#64748B' }}>{pet.rarity}</Text><Text accessibilityLabel={`${pet.name} 보유 수량`} style={{ color: '#475569' }}>보유: {pet.ownedCopies}개</Text>
      {pet.ownedCopies >= 11 && pet.eligibleCopies >= 10 && pet.rarity !== 'LEGENDARY' && <Pressable accessibilityRole="button" accessibilityLabel={`${pet.name} 승급`} onPress={() => onPromotePet?.(pet.id)}><Text>승급 (10개)</Text></Pressable>}
    </View>)}</ScrollView>
  </View>;
}

function groupInventoryRows(pets: readonly PetItem[]) {
  const grouped = new Map<string, PetItem & { eligibleCopies: number }>();
  for (const pet of pets) {
    const existing = grouped.get(pet.id);
    const eligibleCopies = pet.selected || pet.locked ? 0 : pet.ownedCopies;
    if (existing) {
      existing.ownedCopies += pet.ownedCopies;
      existing.eligibleCopies += eligibleCopies;
      if (!existing.artUrl && pet.artUrl) existing.artUrl = pet.artUrl;
      continue;
    }
    grouped.set(pet.id, { ...pet, eligibleCopies });
  }
  return [...grouped.values()];
}
