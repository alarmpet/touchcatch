import fs from 'node:fs';
import path from 'node:path';

const catPath = path.resolve('content/learning/catalog.v1.json');
const catalog = JSON.parse(fs.readFileSync(catPath, 'utf8'));

const provenance = {
  provider: 'OPENAI',
  model: 'IMAGEGEN',
  basePromptSha256: null,
  editPromptSha256: null,
  generatedAt: null,
};

const FIXED = {
  'ko-proverb-monkeys-tree': {
    category: 'PROVERB',
    language: 'ko',
    difficulty: 'BEGINNER',
    canonicalAnswer: '원숭이도 나무에서 떨어진다',
    aliases: ['원숭이도나무에서떨어진다'],
    meaning: {
      prompt: '아무리 능숙한 사람도 실수할 수 있다는 뜻은?',
      options: [
        { id: 'option_1', label: '원숭이도 나무에서 떨어진다' },
        { id: 'option_2', label: '호랑이도 제 말하면 온다' },
        { id: 'option_3', label: '토끼가 거북이를 이긴다' },
      ],
      correctOptionId: 'option_1',
    },
    sceneBrief:
      'Cozy Oriental Watercolor painting of a monkey slipping from a tree branch near a forest stream with mossy rocks, banana cluster, bird nest, acorns, vines, butterflies and valley water.',
    changes: [
      'Change the thick tree branch under the monkey from brown bark to bright teal green wood',
      'Change the monkey pants from earth brown to bright magenta pink',
      'Remove the soft green moss patch from the large foreground rock',
      'Add one yellow banana bunch hanging on the lower left branch',
      'Remove the small bird nest from the upper right branches',
      'Change the watercolor cloud wash in the upper sky from soft gray to peach orange',
      'Remove the three acorns from the forest floor near the stream',
      'Change the hanging vine leaves from deep green to bright yellow-green',
      'Add one orange butterfly near the center-right air space',
      'Change the valley stream water from cool blue to turquoise mint',
    ],
    wordHunts: [
      { kind: 'NORMAL', prompt: '원숭이를 찾으세요', object: 'monkey' },
      { kind: 'NORMAL', prompt: '바나나를 찾으세요', object: 'banana' },
      { kind: 'SPECIAL', prompt: '나비를 찾으세요', object: 'butterfly' },
    ],
    suddenDeath: { prompt: '계곡물을 찾으세요', object: 'stream' },
  },
  'ko-proverb-spilled-water': {
    category: 'PROVERB',
    language: 'ko',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: '엎질러진 물',
    aliases: ['엎질러진물'],
    meaning: {
      prompt: '이미 벌어진 일은 되돌릴 수 없다는 뜻은?',
      options: [
        { id: 'option_1', label: '엎질러진 물' },
        { id: 'option_2', label: '우물 안 개구리' },
        { id: 'option_3', label: '소 잃고 외양간 고친다' },
      ],
      correctOptionId: 'option_1',
    },
    sceneBrief:
      'Traditional Korean watercolor ink wash of a spilled water jar on a wooden hanok veranda with straw shoes, plum branch, cushion, door latch, folding screen and sunlight.',
    changes: [
      'Change the jar pattern from dark indigo swirls to bright red geometric bands',
      'Change the spilled water puddle shape from a long oval to a star-like splash',
      'Change the wooden veranda plank color from warm brown to pale ash gray',
      'Remove the pair of straw shoes from the lower left porch edge',
      'Add one blue ceramic flower vase on the right porch corner',
      'Remove the plum blossom branch leaning against the left post',
      'Change the sitting cushion color from muted green to bright coral',
      'Remove the metal door latch from the sliding door frame',
      'Change the sunlight highlight streak on the floor from soft gold to cool white',
      'Change the folding screen painting from mountain ink wash to a red sun disk',
    ],
    wordHunts: [
      { kind: 'NORMAL', prompt: '항아리를 찾으세요', object: 'jar' },
      { kind: 'NORMAL', prompt: '방석을 찾으세요', object: 'cushion' },
      { kind: 'SPECIAL', prompt: '병풍을 찾으세요', object: 'screen' },
    ],
    suddenDeath: { prompt: '엎질러진 물을 찾으세요', object: 'spilled water' },
  },
  'ko-idiom-cheongchul-eoram': {
    category: 'IDIOM',
    language: 'ko',
    difficulty: 'ADVANCED',
    canonicalAnswer: '청출어람',
    aliases: ['靑出於藍'],
    meaning: {
      prompt: '제자가 스승보다 뛰어남을 이르는 말은?',
      options: [
        { id: 'option_1', label: '청출어람' },
        { id: 'option_2', label: '동문서답' },
        { id: 'option_3', label: '대기만성' },
      ],
      correctOptionId: 'option_1',
    },
    sceneBrief:
      'Traditional Korean watercolor ink wash of indigo dye jars, dyed cloth, scholars in robes, bamboo blinds, calligraphy scroll, tea tools and wind chime in a dye courtyard.',
    changes: [
      'Change the indigo dye jar liquid from deep blue to bright cyan',
      'Change the hanging dyed cloth from indigo blue to vivid violet purple',
      'Remove the brush pot from the scholar writing table',
      'Remove the black ink splash mark on the lower courtyard stone',
      'Change the scholar robe color from pale gray to warm saffron yellow',
      'Add one flat stepping stone on the garden path near center',
      'Remove the bamboo blind from the open pavilion opening',
      'Change the hanging scroll border color from black to bright vermilion red',
      'Remove the tea tray tools from the low table',
      'Add one small bronze wind chime under the pavilion eave',
    ],
    wordHunts: [
      { kind: 'NORMAL', prompt: '쪽 항아리를 찾으세요', object: 'dye jar' },
      { kind: 'NORMAL', prompt: '족자를 찾으세요', object: 'scroll' },
      { kind: 'SPECIAL', prompt: '풍경 종을 찾으세요', object: 'wind chime' },
    ],
    suddenDeath: { prompt: '염색 천을 찾으세요', object: 'dyed cloth' },
  },
  'en-phonics-bear': {
    category: 'ENGLISH',
    language: 'en',
    difficulty: 'BEGINNER',
    canonicalAnswer: 'bear',
    aliases: ['Bear'],
    meaning: {
      prompt: 'What animal starts with B in this scene?',
      options: [
        { id: 'option_1', label: '곰 (bear)' },
        { id: 'option_2', label: '고양이 (cat)' },
        { id: 'option_3', label: '돌고래 (dolphin)' },
      ],
      correctOptionId: 'option_1',
    },
    sceneBrief:
      'Handcrafted 3D Claymation of a cute bear eating honey in a forest dingle with stump chair, mushrooms, campfire, berries, birdhouse and soft miniature lighting.',
    changes: [
      'Change the bear fur from warm brown clay to bright cinnamon red clay',
      'Remove the small honey pot paper label from the jar side',
      'Remove the green moss patch from the front tree stump',
      'Add one orange clay salmon fish on the lower right ground',
      'Change the log seat color from dark brown to bright sky blue',
      'Remove the cluster of forest mushrooms near the left stump',
      'Add one yellow butterfly hovering above the honey pot',
      'Change the campfire flame tips from orange to electric blue',
      'Remove the tiny birdhouse from the upper left tree trunk',
      'Change the berry cluster color from red to bright purple',
    ],
    wordHunts: [
      { kind: 'NORMAL', prompt: 'Find the honey pot', object: 'honey pot' },
      { kind: 'NORMAL', prompt: 'Find the campfire', object: 'campfire' },
      { kind: 'SPECIAL', prompt: 'Find the birdhouse', object: 'birdhouse' },
    ],
    suddenDeath: { prompt: 'Find the bear', object: 'bear' },
  },
  'en-phonics-cat': {
    category: 'ENGLISH',
    language: 'en',
    difficulty: 'BEGINNER',
    canonicalAnswer: 'cat',
    aliases: ['Cat'],
    meaning: {
      prompt: 'What animal starts with C in this scene?',
      options: [
        { id: 'option_1', label: '고양이 (cat)' },
        { id: 'option_2', label: '곰 (bear)' },
        { id: 'option_3', label: '개 (dog)' },
      ],
      correctOptionId: 'option_1',
    },
    sceneBrief:
      'Handcrafted 3D Claymation of a mischievous cat playing with yarn in a cozy room with cat tower, fish bone prop, food bowl, window moon and mini plant pot.',
    changes: [
      'Change the cat collar bell ribbon from red to bright turquoise',
      'Change the yarn ball color from soft pink to neon lime green',
      'Remove the cushion pad from the top of the cat tower',
      'Add one white fish-bone prop on the floor near the yarn',
      'Change the inner ear color accents from pale pink to bright orange',
      'Remove the floor carpet rug under the cat',
      'Change the food bowl color from ceramic white to sunny yellow',
      'Remove the crescent moon sticker from the window glass',
      'Add one small green potted plant on the right windowsill',
      'Change the cat body fur from gray tabby to warm cream gold',
    ],
    wordHunts: [
      { kind: 'NORMAL', prompt: 'Find the yarn ball', object: 'yarn' },
      { kind: 'NORMAL', prompt: 'Find the food bowl', object: 'bowl' },
      { kind: 'SPECIAL', prompt: 'Find the cat tower', object: 'cat tower' },
    ],
    suddenDeath: { prompt: 'Find the cat', object: 'cat' },
  },
  'en-phonics-dolphin': {
    category: 'ENGLISH',
    language: 'en',
    difficulty: 'BEGINNER',
    canonicalAnswer: 'dolphin',
    aliases: ['Dolphin'],
    meaning: {
      prompt: 'What sea creature starts with D in this scene?',
      options: [
        { id: 'option_1', label: '돌고래 (dolphin)' },
        { id: 'option_2', label: '상어 (shark)' },
        { id: 'option_3', label: '문어 (octopus)' },
      ],
      correctOptionId: 'option_1',
    },
    sceneBrief:
      'Layered papercut craft of a playful dolphin leaping over ocean waves with coral, shells, sun, bubbles, turtle, seaweed, treasure chest and sandcastle layers.',
    changes: [
      'Change the dolphin body paper color from blue-gray to bright aqua green',
      'Change the dorsal fin shape from curved triangle to a notched fin silhouette',
      'Remove the underwater coral cluster from the lower left layer',
      'Add one large spiral seashell on the lower right sand layer',
      'Change the island sun disk color from warm yellow to hot pink',
      'Remove the bubble trail paper cutouts near the dolphin jump',
      'Add one green sea turtle on the mid-right wave layer',
      'Change the seaweed ribbons from deep green to bright orange paper',
      'Remove the treasure chest from the seabed corner',
      'Add one sandcastle with three towers on the foreground beach strip',
    ],
    wordHunts: [
      { kind: 'NORMAL', prompt: 'Find the seashell', object: 'seashell' },
      { kind: 'NORMAL', prompt: 'Find the seaweed', object: 'seaweed' },
      { kind: 'SPECIAL', prompt: 'Find the sandcastle', object: 'sandcastle' },
    ],
    suddenDeath: { prompt: 'Find the dolphin', object: 'dolphin' },
  },
  'en-space-blackhole': {
    category: 'GENERAL_KNOWLEDGE',
    language: 'en',
    difficulty: 'ADVANCED',
    canonicalAnswer: 'blackhole',
    aliases: ['black hole', 'Blackhole'],
    meaning: {
      prompt: 'What region of spacetime lets nothing escape, not even light?',
      options: [
        { id: 'option_1', label: '블랙홀 (blackhole)' },
        { id: 'option_2', label: '혜성 (comet)' },
        { id: 'option_3', label: '성운 (nebula)' },
      ],
      correctOptionId: 'option_1',
    },
    sceneBrief:
      'Futuristic 3D Sci-Fi render of a space station observing a swirling purple blackhole with holograms, neon spacesuit lines, consoles, batteries, robot arm, sensor dish and camera.',
    changes: [
      'Change the blackhole accretion disk glow from purple to bright cyan green',
      'Remove the floating hologram star map from the left viewport',
      'Change the spacesuit neon trim lines from cyan to hot magenta',
      'Remove the center control console monitor screen',
      'Add one glowing energy battery crate on the lower right deck',
      'Change the data horizon ring color from white to amber gold',
      'Remove the robot arm attached to the station railing',
      'Change the sensor dish color from metallic gray to bright orange',
      'Add one extra starlight glow flare in the upper left sky',
      'Remove the auxiliary camera pod from the outer hull',
    ],
    wordHunts: [
      { kind: 'NORMAL', prompt: 'Find the sensor dish', object: 'sensor dish' },
      { kind: 'NORMAL', prompt: 'Find the energy battery', object: 'battery' },
      { kind: 'SPECIAL', prompt: 'Find the hologram map', object: 'hologram' },
    ],
    suddenDeath: { prompt: 'Find the blackhole', object: 'blackhole' },
  },
  'en-future-robotics': {
    category: 'GENERAL_KNOWLEDGE',
    language: 'en',
    difficulty: 'ADVANCED',
    canonicalAnswer: 'robotics',
    aliases: ['Robotics'],
    meaning: {
      prompt: 'Which field designs and builds robots?',
      options: [
        { id: 'option_1', label: '로봇공학 (robotics)' },
        { id: 'option_2', label: '식물학 (botany)' },
        { id: 'option_3', label: '지리학 (geography)' },
      ],
      correctOptionId: 'option_1',
    },
    sceneBrief:
      'Futuristic 3D Sci-Fi render of an android robotics lab with glowing neon circuits, tools, charts, researcher coat, antenna, cleaning robot and glass tubes.',
    changes: [
      'Change the android core chest light from cyan to bright red',
      'Remove the circuit board spark effect near the workbench',
      'Change the wrench tool color from steel gray to neon lime',
      'Remove the wall display chart from the upper left panel',
      'Change the researcher lab coat from white to deep indigo',
      'Add one small wheeled robot chassis on the lower center floor',
      'Remove the cleaning electrolyte bottle from the side shelf',
      'Change the antenna tip glow from blue to gold yellow',
      'Add one round cleaning robot near the right doorway',
      'Remove the bright highlight stripe from the tall glass tube',
    ],
    wordHunts: [
      { kind: 'NORMAL', prompt: 'Find the wrench', object: 'wrench' },
      { kind: 'NORMAL', prompt: 'Find the antenna', object: 'antenna' },
      { kind: 'SPECIAL', prompt: 'Find the cleaning robot', object: 'cleaning robot' },
    ],
    suddenDeath: { prompt: 'Find the android core', object: 'android core' },
  },
  'en-profession-architect': {
    category: 'GENERAL_KNOWLEDGE',
    language: 'en',
    difficulty: 'INTERMEDIATE',
    canonicalAnswer: 'architect',
    aliases: ['Architect'],
    meaning: {
      prompt: 'Who designs buildings and construction plans?',
      options: [
        { id: 'option_1', label: '건축가 (architect)' },
        { id: 'option_2', label: '조종사 (pilot)' },
        { id: 'option_3', label: '요리사 (chef)' },
      ],
      correctOptionId: 'option_1',
    },
    sceneBrief:
      'High-end 3D Pixar style render of an architect designing blueprint models in a bright studio with miniature buildings, drafting tools, lamp, suspenders, triangle ruler, coffee tumbler and monitor.',
    changes: [
      'Change the miniature building model color from white plaster to bright teal',
      'Change the blueprint paper wash from classic blue to soft lavender',
      'Remove the drafting pencil from the center desk',
      'Change the desk lamp shade color from brass gold to cherry red',
      'Remove the architect suspenders from the shirt',
      'Change the triangle ruler color from transparent green to bright yellow',
      'Add one coffee tumbler on the right desk corner',
      'Remove the document tray stack from the left shelf',
      'Change the computer monitor bezel color from black to mint green',
      'Add one hanging ceiling pendant light above the desk',
    ],
    wordHunts: [
      { kind: 'NORMAL', prompt: 'Find the blueprint', object: 'blueprint' },
      { kind: 'NORMAL', prompt: 'Find the desk lamp', object: 'lamp' },
      { kind: 'SPECIAL', prompt: 'Find the building model', object: 'model' },
    ],
    suddenDeath: { prompt: 'Find the triangle ruler', object: 'triangle ruler' },
  },
  'en-scenery-coral-reef': {
    category: 'GENERAL_KNOWLEDGE',
    language: 'en',
    difficulty: 'BEGINNER',
    canonicalAnswer: 'coral reef',
    aliases: ['Coral Reef', 'coral'],
    meaning: {
      prompt: 'What underwater ecosystem is built by coral polyps?',
      options: [
        { id: 'option_1', label: '산호초 (coral reef)' },
        { id: 'option_2', label: '사막 (desert)' },
        { id: 'option_3', label: '초원 (grassland)' },
      ],
      correctOptionId: 'option_1',
    },
    sceneBrief:
      'Layered papercut craft art of a vibrant undersea coral reef with exotic fish, jellyfish, seaweed pillars, treasure gems, pearl clam, rock cave and light layers.',
    changes: [
      'Change the large foreground coral color from pink to electric lime green',
      'Remove the jellyfish glow silhouette from the upper mid water',
      'Change the tropical fish stripe color from yellow-blue to red-white',
      'Remove the submarine porthole window from the left mid layer',
      'Add one purple manta ray gliding across the upper right layer',
      'Change the seaweed pillar color from deep green to bright orange',
      'Remove the treasure chest gems pile from the seabed',
      'Change the clam pearl color from white to vivid magenta',
      'Add one dark rock cave opening on the lower left reef wall',
      'Remove one underwater light shaft layer from the center water',
    ],
    wordHunts: [
      { kind: 'NORMAL', prompt: 'Find the tropical fish', object: 'fish' },
      { kind: 'NORMAL', prompt: 'Find the clam pearl', object: 'pearl' },
      { kind: 'SPECIAL', prompt: 'Find the manta ray', object: 'manta ray' },
    ],
    suddenDeath: { prompt: 'Find the large coral', object: 'coral' },
  },
};

const keys = Object.keys(FIXED);
let updated = 0;
const seen = new Set();
catalog.entries = catalog.entries.map((e) => {
  if (!FIXED[e.key]) return e;
  updated += 1;
  seen.add(e.key);
  return {
    key: e.key,
    ...FIXED[e.key],
    status: 'DRAFT',
    promptProvenance: provenance,
  };
});

for (const key of keys) {
  if (!seen.has(key)) {
    catalog.entries.push({
      key,
      ...FIXED[key],
      status: 'DRAFT',
      promptProvenance: provenance,
    });
    updated += 1;
  }
}

fs.writeFileSync(catPath, JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ updated, total: catalog.entries.length }));
