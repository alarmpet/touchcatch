import fs from 'fs';
import path from 'path';

const catPath = path.resolve('content/learning/catalog.v1.json');
const catalog = JSON.parse(fs.readFileSync(catPath, 'utf-8'));

export const NEW_10_PACKS = [
  {
    key: "ko-proverb-monkeys-tree",
    category: "PROVERB",
    language: "ko",
    difficulty: "BEGINNER",
    canonicalAnswer: "원숭이도 나무에서 떨어진다",
    aliases: ["원숭이도나무에서떨어진다"],
    meaning: { prompt: "아무리 원숭이라도 나무에서 떨어질 수 있다", options: ["원숭이도 나무에서 떨어진다"], correctOptionId: "opt1" },
    sceneBrief: "Cozy Oriental Watercolor painting of a monkey slipping from a tree branch near a forest stream.",
    changes: ["1. 나뭇가지 색상 변경", "2. 떨어지는 원숭이 바지 색상 변경", "3. 바위 이끼 제거", "4. 바나나 송이 추가", "5. 새 nest 제거", "6. 수채화 구름 색상 변경", "7. 도토리 제거", "8. 덩굴 색상 변경", "9. 나비 추가", "10. 계곡물 색상 변경"],
    wordHunts: [{ object: "원숭이", prompt: "monkey", kind: "noun" }],
    suddenDeath: { prompt: "다음 속담의 빈칸은? ( )도 나무에서 떨어진다", options: ["원숭이", "호랑이"], correctIndex: 0 },
    promptProvenance: { provider: "google", model: "gemini-3.1-flash-image", basePromptSha256: "a", editPromptSha256: "b", generatedAt: "2026-07-30T22:25:00Z" }
  },
  {
    key: "ko-proverb-spilled-water",
    category: "PROVERB",
    language: "ko",
    difficulty: "INTERMEDIATE",
    canonicalAnswer: "엎질러진 물",
    aliases: ["엎질러진물"],
    meaning: { prompt: "이미 저질러진 일은 다시 돌이킬 수 없다", options: ["엎질러진 물"], correctOptionId: "opt1" },
    sceneBrief: "Traditional Korean watercolor ink wash of a spilled water jar on a wooden veranda.",
    changes: ["1. 항아리 문양 변경", "2. 엎질러진 물 형태 변경", "3. 마루판 색상 변경", "4. 짚신 제거", "5. 뜰마루 꽃병 추가", "6. 매화 가지 제거", "7. 방석 색상 변경", "8. 문고리 제거", "9. 햇살 하이라이트 변경", "10. 병풍 그림 변경"],
    wordHunts: [{ object: "물", prompt: "water", kind: "noun" }],
    suddenDeath: { prompt: "이미 ( )은 다시 담을 수 없다", options: ["엎질러진 물", "담아둔 물"], correctIndex: 0 },
    promptProvenance: { provider: "google", model: "gemini-3.1-flash-image", basePromptSha256: "a", editPromptSha256: "b", generatedAt: "2026-07-30T22:25:00Z" }
  },
  {
    key: "ko-idiom-cheongchul-eoram",
    category: "IDIOM",
    language: "ko",
    difficulty: "ADVANCED",
    canonicalAnswer: "청출어람",
    aliases: ["靑出於藍"],
    meaning: { prompt: "제자가 스승보다 뛰어남을 이르는 말", options: ["청출어람"], correctOptionId: "opt1" },
    sceneBrief: "Traditional Korean watercolor ink wash of indigo dye jars and scholars.",
    changes: ["1. 쪽풀 항아리 색상 변경", "2. 염색 천 색상 변경", "3. 붓 통 제거", "4. 먹물 자국 제거", "5. 선비 도포 색상 변경", "6. 디딤돌 추가", "7. 대나무 발 제거", "8. 족자 색상 변경", "9. 차 도구 제거", "10. 풍경 종 추가"],
    wordHunts: [{ object: "청출어람", prompt: "pupil surpassing master", kind: "idiom" }],
    suddenDeath: { prompt: "스승보다 제자가 뛰어남을 뜻하는 사자성어는?", options: ["청출어람", "동문서답"], correctIndex: 0 },
    promptProvenance: { provider: "google", model: "gemini-3.1-flash-image", basePromptSha256: "a", editPromptSha256: "b", generatedAt: "2026-07-30T22:25:00Z" }
  },
  {
    key: "en-phonics-bear",
    category: "ENGLISH",
    language: "en",
    difficulty: "BEGINNER",
    canonicalAnswer: "Bear",
    aliases: ["곰", "B - Bear"],
    meaning: { prompt: "B is for Bear", options: ["Bear"], correctOptionId: "opt1" },
    sceneBrief: "Handcrafted 3D Claymation of a cute bear eating honey in a forest dingle.",
    changes: ["1. 곰 털 색상 변경", "2. 꿀단지 라벨 제거", "3. 나무 등걸 이끼 제거", "4. 연어 물고기 추가", "5. 통나무 의자 색상 변경", "6. 숲 버섯 제거", "7. 나비 추가", "8. 캠프파이어 불꽃 색상 변경", "9. 새집 제거", "10. 열매 색상 변경"],
    wordHunts: [{ object: "bear", prompt: "bear", kind: "noun" }],
    suddenDeath: { prompt: "Which animal starts with B?", options: ["Bear", "Cat"], correctIndex: 0 },
    promptProvenance: { provider: "google", model: "gemini-3.1-flash-image", basePromptSha256: "a", editPromptSha256: "b", generatedAt: "2026-07-30T22:25:00Z" }
  },
  {
    key: "en-phonics-cat",
    category: "ENGLISH",
    language: "en",
    difficulty: "BEGINNER",
    canonicalAnswer: "Cat",
    aliases: ["고양이", "C - Cat"],
    meaning: { prompt: "C is for Cat", options: ["Cat"], correctOptionId: "opt1" },
    sceneBrief: "Handcrafted 3D Claymation of a mischievous cat playing with yarn in a room.",
    changes: ["1. 고양이 방울 리본 색상 변경", "2. 실타래 색상 변경", "3. 캣타워 방석 제거", "4. 생선 뼈 소품 추가", "5. 고양이 귀 포인트 색상 변경", "6. 마루 카펫 제거", "7. 사료 그릇 색상 변경", "8. 창문 달님 제거", "9. 미니 화분 추가", "10. 고양이 털 색상 변경"],
    wordHunts: [{ object: "cat", prompt: "cat", kind: "noun" }],
    suddenDeath: { prompt: "Which animal starts with C?", options: ["Cat", "Dog"], correctIndex: 0 },
    promptProvenance: { provider: "google", model: "gemini-3.1-flash-image", basePromptSha256: "a", editPromptSha256: "b", generatedAt: "2026-07-30T22:25:00Z" }
  },
  {
    key: "en-phonics-dolphin",
    category: "ENGLISH",
    language: "en",
    difficulty: "BEGINNER",
    canonicalAnswer: "Dolphin",
    aliases: ["돌고래", "D - Dolphin"],
    meaning: { prompt: "D is for Dolphin", options: ["Dolphin"], correctOptionId: "opt1" },
    sceneBrief: "Layered papercut craft of a playful dolphin leaping over ocean waves.",
    changes: ["1. 돌고래 색상 변경", "2. 등지느러미 형태 변경", "3. 수중 산호초 제거", "4. 조개껍데기 추가", "5. 산호 섬 태양 색상 변경", "6. 물방울 기포 제거", "7. 바다거북 추가", "8. 해초 색상 변경", "9. 보물상자 제거", "10. 모래성 추가"],
    wordHunts: [{ object: "dolphin", prompt: "dolphin", kind: "noun" }],
    suddenDeath: { prompt: "Which sea creature starts with D?", options: ["Dolphin", "Shark"], correctIndex: 0 },
    promptProvenance: { provider: "google", model: "gemini-3.1-flash-image", basePromptSha256: "a", editPromptSha256: "b", generatedAt: "2026-07-30T22:25:00Z" }
  },
  {
    key: "en-space-blackhole",
    category: "GENERAL_KNOWLEDGE",
    language: "en",
    difficulty: "ADVANCED",
    canonicalAnswer: "Blackhole",
    aliases: ["블랙홀", "Space Blackhole"],
    meaning: { prompt: "A region of spacetime where gravity is so strong that nothing can escape.", options: ["Blackhole"], correctOptionId: "opt1" },
    sceneBrief: "Futuristic 3D Sci-Fi render of a space station observing a swirling purple blackhole.",
    changes: ["1. 블랙홀 강착원반 색상 변경", "2. 홀로그램 성도 제거", "3. 우주복 네온선 색상 변경", "4. 제어 콘솔 모니터 제거", "5. 에너지 배터리 추가", "6. 데이터 수평선 색상 변경", "7. 로봇암 제거", "8. 센서 디시 색상 변경", "9. 별빛 글로우 추가", "10. 보조 카메라 제거"],
    wordHunts: [{ object: "blackhole", prompt: "blackhole", kind: "noun" }],
    suddenDeath: { prompt: "What celestial object has gravitational attraction so strong that even light cannot escape?", options: ["Blackhole", "Comet"], correctIndex: 0 },
    promptProvenance: { provider: "google", model: "gemini-3.1-flash-image", basePromptSha256: "a", editPromptSha256: "b", generatedAt: "2026-07-30T22:25:00Z" }
  },
  {
    key: "en-future-robotics",
    category: "GENERAL_KNOWLEDGE",
    language: "en",
    difficulty: "ADVANCED",
    canonicalAnswer: "Robotics",
    aliases: ["로봇공학", "Future Android Lab"],
    meaning: { prompt: "The branch of technology that deals with the design and construction of robots.", options: ["Robotics"], correctOptionId: "opt1" },
    sceneBrief: "Futuristic 3D Sci-Fi render of an android robotics lab with glowing neon circuits.",
    changes: ["1. 안드로이드 코어 빛 색상 변경", "2. 기판 스파크 제거", "3. 렌치 공구 색상 변경", "4. 디스플레이 차트 제거", "5. 연구원 가운 색상 변경", "6. 로봇 휠 추가", "7. 세척 전해액 제거", "8. 안테나 팁 색상 변경", "9. 청소 로봇 추가", "10. 유리관 하이라이트 제거"],
    wordHunts: [{ object: "robotics", prompt: "robotics", kind: "noun" }],
    suddenDeath: { prompt: "Which field studies mechanical and automated robots?", options: ["Robotics", "Botany"], correctIndex: 0 },
    promptProvenance: { provider: "google", model: "gemini-3.1-flash-image", basePromptSha256: "a", editPromptSha256: "b", generatedAt: "2026-07-30T22:25:00Z" }
  },
  {
    key: "en-profession-architect",
    category: "GENERAL_KNOWLEDGE",
    language: "en",
    difficulty: "INTERMEDIATE",
    canonicalAnswer: "Architect",
    aliases: ["건축가", "Architect Studio"],
    meaning: { prompt: "A person who designs buildings and advises in their construction.", options: ["Architect"], correctOptionId: "opt1" },
    sceneBrief: "High-end 3D Pixar style render of an architect designing blueprint models in a studio.",
    changes: ["1. 미니어처 건물 모형 색상 변경", "2. 청사진 도면 색상 변경", "3. 제도기 연필 제거", "4. 책상 램프 색상 변경", "5. 건축가 멜빵 제거", "6. 삼각자 색상 변경", "7. 커피 텀블러 추가", "8. 서류함 제거", "9. 컴퓨터 모니터 색상 변경", "10. 천장 조명 추가"],
    wordHunts: [{ object: "architect", prompt: "architect", kind: "noun" }],
    suddenDeath: { prompt: "Who designs buildings and structure plans?", options: ["Architect", "Pilot"], correctIndex: 0 },
    promptProvenance: { provider: "google", model: "gemini-3.1-flash-image", basePromptSha256: "a", editPromptSha256: "b", generatedAt: "2026-07-30T22:25:00Z" }
  },
  {
    key: "en-scenery-coral-reef",
    category: "GENERAL_KNOWLEDGE",
    language: "en",
    difficulty: "BEGINNER",
    canonicalAnswer: "Coral Reef",
    aliases: ["산호초", "Coral Reef Ecosystem"],
    meaning: { prompt: "An underwater ecosystem characterized by reef-building corals.", options: ["Coral Reef"], correctOptionId: "opt1" },
    sceneBrief: "Layered papercut craft art of a vibrant undersea coral reef with exotic sea life.",
    changes: ["1. 대형 산호 색상 변경", "2. 해파리 글로우 제거", "3. 열대어 스트라이프 색상 변경", "4. 잠수함 창문 제거", "5. 바다 가오리 추가", "6. 해초 기둥 색상 변경", "7. 보물 상자 보석 제거", "8. 조개 진주 색상 변경", "9. 바위 굴 추가", "10. 수중 빛 레이어 제거"],
    wordHunts: [{ object: "coral", prompt: "coral", kind: "noun" }],
    suddenDeath: { prompt: "What underwater ecosystem is formed by coral polyps?", options: ["Coral Reef", "Desert"], correctIndex: 0 },
    promptProvenance: { provider: "google", model: "gemini-3.1-flash-image", basePromptSha256: "a", editPromptSha256: "b", generatedAt: "2026-07-30T22:25:00Z" }
  }
];

export function registerNewPacks() {
  let count = 0;
  for (const pack of NEW_10_PACKS) {
    if (!catalog.entries.some(e => e.key === pack.key)) {
      catalog.entries.push(pack);
      count++;
    }
  }
  fs.writeFileSync(catPath, JSON.stringify(catalog, null, 2), 'utf-8');
  console.log(`Registered ${count} new packs in catalog.v1.json. Total packs: ${catalog.entries.length}`);
}

if (process.argv[1] === path.resolve('tools/content/register-10-new-packs.js')) {
  registerNewPacks();
}
