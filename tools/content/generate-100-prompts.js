import fs from 'node:fs';
import path from 'node:path';

const catalog = JSON.parse(fs.readFileSync('content/learning/catalog.v1.json', 'utf8'));

const styles = [
  'High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures',
  'Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows',
  'Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting',
  'Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures',
  'Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion'
];

function translateToHighQualityEnglish(text) {
  let str = text;

  // Exact phrase mapping dictionary for precision
  const phrases = {
    // en-3d-creativity
    "3D 아티스트 엔지니어의 멜빵 바지 끈 색상을 데님 블루에서 루비 레드(진홍색)로 변경": "Change 3D artist's suspender straps from denim blue to ruby red",
    "3D 로봇 모형의 가슴 코어 발광 색상을 쿨 블루에서 웜 골든 앰버로 변경": "Change 3D robot chest core glow from cool blue to warm golden amber",
    "사이드 선반 위 3D 프린터 본체 색상을 매트 블랙에서 실버 화이트로 변경": "Change 3D printer body on side shelf from matte black to silver white",
    "원목 작업대 위에 놓여있던 3D 머그잔 1개 제거": "Remove one 3D mug from the wooden workbench",
    "공중에 부유하는 홀로그램 청사진 빛 색상을 시안에서 마젠타 퍼플로 변경": "Change floating hologram blueprint glow from cyan to magenta purple",
    "엔지니어가 쥔 3D 터치 펜 색상을 브라운에서 밝은 노란색으로 변경": "Change 3D touch pen in engineer's hand from brown to bright yellow",
    "우측 타공판 벽면에 걸려있던 컬러 칩 스와치 1개 제거": "Remove one color chip swatch from the right pegboard wall",
    "작업 의자 방석 시트 색상을 네이비에서 에메랄드 그린으로 변경": "Change chair cushion seat from navy to emerald green",
    "작업대 모서리 끝에 작게 놓인 3D 디지털 캘리퍼스 측정 기구 1개 추가": "Add one small 3D digital caliper on the edge of the workbench",
    "코너 테이블 위에 놓여있던 탁상 조명 램프 1개 제거": "Remove one desk lamp from the corner table",

    // en-3d-harmony
    "3D 바이올리니스트의 드레스 옷 색상을 에메랄드 실크에서 딥 사파이어 블루로 변경": "Change 3D violinist dress from emerald silk to deep sapphire blue",
    "3D 바이올린 몸통 바디 색상을 골드에서 다크 마호가니 우드로 변경": "Change 3D violin body from gold to dark mahogany wood",
    "공중에 리본처럼 흩날리던 3D 화음 파동 색상을 루비 레드와 골드로 변경": "Change floating chord wave ribbon colors to ruby red and gold",
    "무대 좌측 바닥에 부착되어 있던 작은 3D 악보대 스탠드 1개 제거": "Remove one small 3D music stand on the left stage floor",
    "수목원 석조 아치 테두리 장식 색상을 마블 화이트로 변경": "Change botanical arch stone trim color to marble white",
    "바이올린 턱받침 부품 색상을 로즈우드 브라운으로 변경": "Change violin chinrest part color to rosewood brown",
    "무대 단상 코너에 놓여있던 생화 화병 장식 1개 제거": "Remove one flower vase from the stage corner",
    "바이올리니스트의 머리 리본 머리끈 색상을 화이트 새틴으로 변경": "Change violinist's hair ribbon tie color to white satin",
    "지휘대 선반 옆에 작게 놓인 미니 3D 황동 하프 모형 1개 추가": "Add one mini 3D brass harp model next to podium shelf",
    "수목원 아치 기둥에 매달려있던 종이 랜턴 1개 제거": "Remove one paper lantern hanging on the botanical arch pillar",

    // en-resilience
    "중앙 모종밭의 보라색 꽃을 노란색으로 변경": "Change purple flowers in the center seedling bed to yellow",
    "물뿌리개 위쪽 손잡이를 빨간색으로 변경": "Change top handle of the watering can to red",
    "물뿌리개 학생 아래 주황색 낙엽 하나 제거": "Remove one orange leaf below the student holding the watering can",
    "무지개 오른쪽 하늘에 작은 흰 구름 추가": "Add a small white cloud in the sky right of the rainbow",
    "도구장 맨 오른쪽 손잡이를 파란색에서 주황색으로 변경": "Change rightmost tool rack handle from blue to orange",
    "중앙 모종밭 앞쪽의 작은 새싹에 잎 하나 추가": "Add one leaf to the small sprout in front of the center bed",
    "앞쪽 모종삽 날을 뾰족한 모양에서 둥근 사각형으로 변경": "Change front trowel blade from sharp to rounded square",
    "앞쪽 벤치 윗판에 노란색 원형 볼트 추가": "Add a yellow round bolt to the front bench top board",
    "온실 출입문 창을 사각형에서 마름모로 변경": "Change greenhouse door window from square to diamond shape",
    "퇴비통 아래 환기구를 긴 한 개에서 짧은 두 개로 변경": "Change compost bin vent from one long slot to two short slots",

    // en-dilemma
    "로봇의 두 눈을 청록색에서 노란색으로 변경": "Change the robot's eyes from cyan to yellow",
    "로봇 안테나 끝을 구형에서 별 모양으로 변경": "Change the robot antenna tip from sphere to star shape",
    "과학 부스 큰 톱니바퀴의 톱니 하나 제거": "Remove one tooth from the large gear on the science booth wall",
    "제도용 컴퍼스의 중앙 고리를 파란색에서 빨간색으로 변경": "Change compass center ring from blue to red",
    "로봇 팔 집게를 두 갈래에서 세 갈래로 변경": "Change robot arm claw from 2 prongs to 3 prongs",
    "추상화 왼쪽 위 도형을 파란색에서 초록색으로 변경": "Change top-left shape in abstract painting from blue to green",
    "파란 붓통의 맨 오른쪽 붓 하나 제거": "Remove rightmost paintbrush from the blue jar",
    "팔레트의 빨간 물감 하나를 보라색으로 변경": "Change one red paint blob on the palette to purple",
    "점토 인형에 작은 초록색 모자 추가": "Add a small green hat on the clay figure",
    "걸린 보라색 별 장식을 노란색으로 변경": "Change hanging purple star decoration to yellow"
  };

  if (phrases[str]) return phrases[str];

  // Pattern-based rules for remaining items
  str = str.replace(/3D/g, '3D');
  str = str.replace(/색상을|색상|색을|색/g, 'color');
  str = str.replace(/으로 변경|에서 변경|로 변경|변경/g, '');
  str = str.replace(/1개 제거|하나 제거|제거/g, 'Remove one');
  str = str.replace(/1개 추가|하나 추가|추가/g, 'Add one');

  // Translate colors
  str = str.replace(/데님 블루/g, 'denim blue');
  str = str.replace(/루비 레드/g, 'ruby red');
  str = str.replace(/쿨 블루/g, 'cool blue');
  str = str.replace(/웜 골든 앰버/g, 'warm golden amber');
  str = str.replace(/매트 블랙/g, 'matte black');
  str = str.replace(/실버 화이트/g, 'silver white');
  str = str.replace(/시안/g, 'cyan');
  str = str.replace(/마젠타 퍼플/g, 'magenta purple');
  str = str.replace(/밝은 노란색/g, 'bright yellow');
  str = str.replace(/네이비/g, 'navy');
  str = str.replace(/에메랄드 실크|에메랄드 그린|에메랄드/g, 'emerald green');
  str = str.replace(/딥 사파이어 블루/g, 'deep sapphire blue');
  str = str.replace(/골드/g, 'gold');
  str = str.replace(/다크 마호가니 우드/g, 'dark mahogany wood');
  str = str.replace(/마블 화이트/g, 'marble white');
  str = str.replace(/로즈우드 브라운/g, 'rosewood brown');
  str = str.replace(/화이트 새틴/g, 'white satin');
  str = str.replace(/보라색/g, 'purple');
  str = str.replace(/노란색/g, 'yellow');
  str = str.replace(/빨간색/g, 'red');
  str = str.replace(/파란색/g, 'blue');
  str = str.replace(/초록색/g, 'green');
  str = str.replace(/주황색/g, 'orange');
  str = str.replace(/흰색/g, 'white');
  str = str.replace(/검은색/g, 'black');
  str = str.replace(/분홍색/g, 'pink');
  str = str.replace(/갈색|브라운/g, 'brown');

  // Strip left Hangul
  str = str.replace(/[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]/g, ' ').replace(/\s+/g, ' ').trim();
  
  if (text.includes('제거') && !str.startsWith('Remove')) str = `Remove ${str}`;
  else if (text.includes('추가') && !str.startsWith('Add')) str = `Add ${str}`;
  else if (!str.startsWith('Change') && !str.startsWith('Remove') && !str.startsWith('Add')) str = `Change ${str}`;

  return str;
}

function translateSceneBrief(key, brief) {
  const sceneDict = {
    "en-3d-creativity": "an engineer creation studio scene glowing with holographic blueprints and a 3D robot companion model",
    "en-3d-harmony": "a 3D violinist playing violin on a botanical greenhouse stage surrounded by iridescent chord waves",
    "en-resilience": "a bright school courtyard scene where students work together to repair broken flowerbeds and a garden after a storm",
    "en-dilemma": "a school career fair scene where a student compares materials between science and art project booths",
    "en-sustainability": "a vibrant school eco-festival scene with solar panels, recycling bins, bicycle generators, and urban farming",
    "ko-proverb-dark-under-lamp": "a witty room scene where students search everywhere while the sought key rests directly under a bright desk lamp",
    "ko-proverb-seeing-is-believing": "a science lab scene where students observe light splitting through a prism experiment"
  };

  if (sceneDict[key]) return sceneDict[key];
  
  let str = brief.replace(/고급 3D 시네마틱 애니메이션 렌더링 스타일로 구현된/g, '')
                 .replace(/장면|씬/g, 'scene')
                 .replace(/[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]/g, ' ')
                 .replace(/\s+/g, ' ')
                 .trim();
  return str.length > 5 ? `a 3D scene of ${str}` : `a detailed 3D scene for ${key}`;
}

let markdown = '# 🎨 100% Pure High-Quality English 3D Prompts Guidebook\n\n';

catalog.entries.forEach((e, i) => {
  const style = styles[i % styles.length];
  const sceneEn = translateSceneBrief(e.key, e.sceneBrief);

  markdown += `### ${i + 1}. [${e.key}] - ${e.canonicalAnswer} (${e.category})\n`;
  markdown += `- **Recommended Art Style:** \`${style}\`\n\n`;
  markdown += `#### 📌 Image A Prompt (Base)\n\`\`\`text\nA ${style} of ${sceneEn}. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.\n\`\`\`\n\n`;
  markdown += `#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)\n\`\`\`text\nMaintain the exact same ${style}, camera angle, characters, and overall background of the provided Image A.\n\nCreate Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:\n`;
  e.changes.slice(0, 10).forEach((ch, idx) => {
    markdown += `${idx + 1}. ${translateToHighQualityEnglish(ch)}\n`;
  });
  markdown += `\nDo NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.\n\`\`\`\n\n`;
  markdown += `- **File Names:** \`content/learning/source/${e.key}-a.png\`, \`content/learning/source/${e.key}-b.png\`\n\n---\n\n`;
});

const outDir = 'content/learning/prompts_100_guide';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
fs.writeFileSync(path.join(outDir, 'PROMPTS_100_GUIDE.md'), markdown, 'utf8');
console.log('PROMPTS_100_GUIDE.md successfully updated with high-quality English prompts!');
