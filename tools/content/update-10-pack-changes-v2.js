import fs from 'node:fs';

const p = 'content/learning/catalog.v1.json';
const c = JSON.parse(fs.readFileSync(p, 'utf8'));

const UPDATES = {
  'ko-proverb-monkeys-tree': {
    sceneBrief:
      'Single continuous Korean watercolor of a monkey slipping from a forest branch over a stream, with nest, vines, rocks, acorns and sky props for spot-the-difference.',
    changes: [
      'UPPER-LEFT: Remove the bird nest with eggs and bird from the upper pine branch',
      'UPPER-CENTER: Recolor only the main soft cloud wash from gray to peach orange',
      'UPPER-RIGHT: Add one orange butterfly in the upper-right air near the branch tip',
      'MIDDLE-LEFT: Recolor only hanging vine leaves from deep green to bright yellow',
      'MIDDLE-CENTER: Recolor only the monkey pants from earth brown to magenta pink',
      'MIDDLE branch: Recolor only the main curved branch wood from brown to bright teal',
      'LOWER-LEFT: Remove the green moss patch from the large left rock',
      'LOWER-CENTER: Remove all acorns from the mid-stream rock',
      'LOWER-RIGHT: Add one yellow banana bunch on the lower-right rock',
      'LOWER water: Shift lower-center stream water from cool blue toward turquoise mint',
    ],
  },
  'ko-proverb-spilled-water': {
    sceneBrief:
      'Single continuous Korean watercolor of a spilled jar on a hanok veranda with shoes, cushion, screen, latch and sunlight props for spot-the-difference.',
    changes: [
      'UPPER-LEFT: Remove the plum blossom branch and petals from the left post',
      'UPPER-CENTER: Change the sunbeam from warm gold to cool white-blue light',
      'UPPER-RIGHT: Add one small red paper lantern near the upper-right door frame',
      'MIDDLE-LEFT: Remove the pair of straw shoes completely',
      'MIDDLE-CENTER jar: Recolor only this jar pattern from indigo blue swirls to coral red bands',
      'MIDDLE-CENTER puddle: Change spilled water outline to a star-like jagged splash',
      'MIDDLE-RIGHT: Remove the metal door latch or ring from the sliding door',
      'LOWER-LEFT: Recolor only the sitting cushion from muted green to bright violet',
      'LOWER-CENTER: Add one small teal ceramic vase on the lower boards',
      'LOWER-RIGHT: Change only the folding screen art to a red sun disk on cream panels',
    ],
  },
  'en-phonics-bear': {
    sceneBrief:
      'Single continuous claymation forest dingle with a bear eating honey, birdhouse, mushrooms, campfire and stump for spot-the-difference.',
    changes: [
      'UPPER-LEFT: Recolor only the berry cluster from red to bright purple',
      'UPPER-CENTER: Add one yellow butterfly above the honey pot',
      'UPPER-RIGHT: Remove the birdhouse from the tree branch',
      'MIDDLE-LEFT: Remove the largest red mushroom group on the left foreground',
      'MIDDLE-CENTER: Recolor only the bear fur from brown to cinnamon red clay',
      'MIDDLE pot: Remove the HONEY paper label from the pot side',
      'MIDDLE stump: Recolor only the stump seat surface to bright sky blue',
      'LOWER-RIGHT fire: Recolor only campfire flame tips from orange to electric blue',
      'LOWER-RIGHT ground: Add one orange clay salmon fish near the fire',
      'LOWER-LEFT: Remove one extra foreground mushroom or moss patch near left mushrooms',
    ],
  },
  'en-phonics-cat': {
    sceneBrief:
      'Single continuous claymation room with a cat, yarn ball, cat tower, window moon, bowl and carpet for spot-the-difference.',
    changes: [
      'UPPER-LEFT: Remove the crescent moon sticker from the window glass',
      'UPPER wall: Keep wall; no global recolor',
      'UPPER-RIGHT tower: Remove hanging pom-toy from the cat tower if present',
      'MIDDLE-RIGHT: Remove the cushion pad from the top cat-tower platform',
      'MIDDLE: Recolor only the collar ribbon from red to bright turquoise',
      'MIDDLE: Recolor only the yarn ball from pink to neon lime green',
      'MIDDLE: Recolor only the cat body fur toward warm cream gold',
      'LOWER: Remove the colorful floor carpet so the floor is plain boards',
      'LOWER-RIGHT: Recolor only the food bowl to sunny yellow',
      'LOWER near yarn: Add one white fish-bone prop on the floor',
    ],
  },
  'en-phonics-dolphin': {
    sceneBrief:
      'Single continuous papercut ocean with a leaping dolphin, sun, coral, seaweed, treasure and sand for spot-the-difference.',
    changes: [
      'UPPER-RIGHT: Recolor only the sun disk from warm yellow to hot pink',
      'UPPER air: Remove bubble trail cutouts near the dolphin jump',
      'MIDDLE: Recolor only the dolphin body from blue-gray to bright aqua green',
      'MIDDLE fin: Change only the dorsal fin to a notched fin silhouette',
      'MIDDLE-LEFT: Recolor only seaweed ribbons from deep green to bright orange',
      'LOWER-LEFT: Remove the coral cluster',
      'LOWER-CENTER: Remove the treasure chest',
      'LOWER-RIGHT sand: Add one large spiral seashell',
      'MID-RIGHT wave: Add one green sea turtle on a mid wave layer',
      'LOWER beach: Add one sandcastle with three towers on the foreground sand',
    ],
  },
  'en-space-blackhole': {
    sceneBrief:
      'Single continuous sci-fi station deck facing a purple blackhole with hologram, astronaut, console, robot arm, dish and camera for spot-the-difference.',
    changes: [
      'UPPER-LEFT: Add one extra bright starlight flare',
      'LEFT: Remove the floating hologram star map panels',
      'CENTER: Recolor only the accretion disk from purple toward cyan-green',
      'ASTRONAUT: Recolor only suit neon trim from cyan to hot magenta',
      'CONSOLE: Blank or darken the center monitor screens',
      'UPPER: Remove the robot arm from the ceiling rail',
      'RIGHT: Recolor only the large sensor dish to bright orange',
      'RIGHT hull: Remove the auxiliary camera pod',
      'LOWER-RIGHT: Add one glowing energy battery crate on the deck',
      'DISK ring: Shift a thin ring accent toward amber gold',
    ],
  },
  'en-future-robotics': {
    sceneBrief:
      'Single continuous sci-fi robotics lab with android, researcher, tools, wall chart, tubes and cleaning robot for spot-the-difference.',
    changes: [
      'UPPER-LEFT wall: Remove the display chart hologram screens',
      'ANDROID: Recolor only the chest core light from cyan to bright red',
      'TABLE tools: Recolor only the wrench to neon lime green',
      'RESEARCHER: Recolor only the lab coat from white to deep indigo purple',
      'FLOOR center: Add one small wheeled robot chassis near the table',
      'SHELF: Remove one small bottle-like prop if present',
      'MID antenna: Recolor antenna tip glow to gold yellow',
      'RIGHT tubes: Remove bright highlight stripe from one tall glass tube',
      'TABLE: Remove circuit spark effects if present',
      'RIGHT floor: Keep cleaning robot; no global lab recolor',
    ],
  },
  'en-profession-architect': {
    sceneBrief:
      'Single continuous Pixar-style architect studio with model, blueprints, lamp, ruler, monitor and shelves for spot-the-difference.',
    changes: [
      'MODEL: Recolor only the miniature building model from white to bright teal',
      'BLUEPRINTS: Recolor only main blueprint sheets from classic blue to soft lavender',
      'DESK: Remove the drafting pencil from hand or desk',
      'LAMP: Recolor only the desk lamp shade to cherry red',
      'ARCHITECT: Remove the suspenders from the shirt',
      'RULER: Recolor only the triangle ruler from green to bright yellow',
      'DESK right: Add one coffee tumbler on the right desk corner',
      'LEFT shelf: Remove the document tray stack organizer',
      'MONITOR: Recolor only the monitor bezel from black to mint green',
      'CEILING: Add one hanging pendant light above the desk',
    ],
  },
  'en-scenery-coral-reef': {
    sceneBrief:
      'Single continuous papercut coral reef with jellyfish, fish, seaweed, gems, pearl clam and light shafts for spot-the-difference.',
    changes: [
      'FOREGROUND: Recolor only the large pink coral to electric lime green',
      'UPPER mid: Remove the jellyfish glow silhouette',
      'FISH: Recolor only the large tropical fish stripes from yellow-blue to red-white',
      'LEFT mid: Remove the submarine porthole window',
      'UPPER-RIGHT: Add one purple manta ray gliding',
      'SEAWEED: Recolor only green seaweed pillars to bright orange',
      'SEABED: Remove the treasure gems pile',
      'CLAM: Recolor only the pearl from white to vivid magenta',
      'LOWER-LEFT: Add one dark rock cave opening',
      'CENTER water: Remove one underwater light shaft layer',
    ],
  },
};

let n = 0;
for (const e of c.entries) {
  const u = UPDATES[e.key];
  if (!u) continue;
  e.sceneBrief = u.sceneBrief;
  e.changes = u.changes;
  n += 1;
}

fs.writeFileSync(p, JSON.stringify(c, null, 2) + '\n');
console.log(JSON.stringify({ updated: n }));
