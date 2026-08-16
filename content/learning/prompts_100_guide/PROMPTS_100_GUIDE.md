# 🎨 Spot-Difference Image Prompt Guide

> Status: **DRAFT authoring guide**. This document currently contains 79 pack
> sections despite the historical `100` directory name. A section is not
> publishable merely because its prompt exists; generated Image A/B assets,
> private hitboxes, visual-delta evidence, and the quality review contract must
> all pass independently.

## Authoritative gameplay and quality contract

- Every pack contains exactly **10 differences: 7 NORMAL + 3 HARD**. `EASY` is
  not a runtime tier.
- Authoring salience is **4 CLEAR + 3 MODERATE + 3 FOCUSED**. CLEAR and
  MODERATE map to the seven NORMAL objectives; FOCUSED maps to the three HARD
  objectives.
- Each objective must be recorded as structured
  `target + location + before + after` fields. A sentence such as
  `change color`, `remove object`, or `change shape` is not sufficient.
- Use at least four change types across the ten objectives:
  `COLOR`, `ADD`, `REMOVE`, `SHAPE`, `COUNT`, and `DIRECTION`. Do not use more
  than four objectives of one type.
- Derive zones from the final private hitbox centers using a 3×3 grid
  (`A`–`I`). A release-ready pack must occupy at least seven zones and place no
  more than two objectives in one zone. Never move a hitbox merely to satisfy
  this rule; regenerate or revise the actual image pair instead.
- Image B must preserve Image A's composition, camera, lighting direction,
  characters, and art style. Only the ten declared changes are allowed.
- Pixel nudges, texture/grain drift, tiny shadow changes, fog changes, and
  near-imperceptible saturation changes are prohibited.
- Review the real pair at **375×667**, not only the prompt text. Until a human
  has reviewed the generated pair, use `PENDING`; never self-assign `PASS`.
- Timing estimates are playtest observations, not prompt or schema truth.
- The quality manifest supplements authoritative private hitboxes and hashes;
  it never replaces them.

## Required objective record

Use this record for every numbered difference before generating Image B:

```yaml
objectiveId: difference_1
tier: NORMAL
salience: CLEAR
changeType: COLOR
zone: H # derived from the final private hitbox, never guessed from prose
target: wooden bench
location: near the fountain in the lower-left area
before: dark brown seat
after: bright orange seat
mobileReview:
  status: PENDING
  reviewer: null
  reviewedAt: null
```

The existing numbered English change sentences below remain useful generation
instructions, but they are not the machine-readable quality evidence. Before a
pack advances from DRAFT, copy each of its ten intentions into the structured
quality manifest, bind it to the matching geometry and assets, and complete the
mobile and image-pair reviews.

## Image-pair review record

```yaml
imagePairReview:
  status: PENDING
  sameComposition: null
  sameCamera: null
  sameLightingDirection: null
  sameArtStyle: null
  unintendedChangeStatus: PENDING
  reviewedBy: null
  reviewedAt: null
```

Only a real review may replace these `PENDING`/`null` values with a PASS
record. Prompt authorship or file existence is not review evidence.

---

## 📐 9-Zone Composition Rules (MANDATORY for ALL Image A Prompts)

Every Image A prompt must produce an image where **all 9 zones** of the 3×3 grid contain distinct, identifiable objects suitable for spot-the-difference placement.

```
┌─────────────┬─────────────┬─────────────┐
│  A (UL)     │  B (UC)     │  C (UR)     │
│ Must have   │ Must have   │ Must have   │
│ key object  │ key object  │ key object  │
│             │ (NO SUN)    │             │
├─────────────┼─────────────┼─────────────┤
│  D (ML)     │  E (MC)     │  F (MR)     │
│             │  PRIMARY    │             │
│             │  SUBJECT    │             │
├─────────────┼─────────────┼─────────────┤
│  G (LL)     │  H (LC)     │  I (LR)     │
│ Must have   │  MAIN       │ Must have   │
│ key object  │  ACTION     │ key object  │
└─────────────┴─────────────┴─────────────┘
```

**Rules:**
- ❌ **NEVER include a visible sun disk, sun glow, or lens flare anywhere in the image** — direct sunlight creates an unplayable white glare dead zone.
- ✅ Lighting must be **soft, even, diffuse daylight or ambient studio light from off-camera**.
- ✅ **Zone B (Upper Center) MUST contain a concrete physical object** (e.g., roof gable, flag, archway, chandelier, tree canopy), NOT empty sky or light sources.
- ✅ Each corner (A, C, G, I) must have a named, distinct object in the Image A prompt.
- ✅ At least 7 of 9 zones must have difference-capable objects.

---

### 1. [en-resilience] - resilience (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a bright school courtyard scene where students work together to repair broken flowerbeds and a garden after a storm. Soft, even, diffuse daylight illuminates the entire venue without direct sun glare. Key elements arranged across grid zones include: a school clock tower in the upper left corner, a brick building roof gable with a fluttering school flag in the upper center, a rainbow arching over a leafy tree canopy in the upper right, wooden trellises and raised flowerbeds on both sides, scattered storm debris (leaves, stones, fallen branches), five cheerful students in colorful hoodies in the center and mid-ground, a tool rack on the right, and a compost bin in the lower corner. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the fluttering school flag on the upper center roof gable from blue to bright red
2. Add one small fluffy white cloud in the upper right sky right beneath the rainbow
3. Change the clock face outer rim on the upper left tower from gray stone to bright yellow
4. Change the student's hoodie in the lower center foreground from green to bright purple
5. Change the flowers in the left raised garden bed from pink to bright cyan blue
6. Remove the large wooden shovel hanging on the right wall tool rack
7. Change the compost bin in the lower right corner from dark green to bright orange
8. Remove the large fallen tree branch lying on the ground in the center foreground
9. Add one bright red metal watering can resting on the ground near the left garden bed
10. Change the student's hoodie on the far right from orange to bright yellow

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-resilience-a.png`, `content/learning/source/en-resilience-b.png`

---

### 2. [en-dilemma] - dilemma (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a school career fair scene. The diffuse overhead lighting illuminates the entire room evenly. Key elements arranged across grid zones include: a bright blue SCIENCE booth sign banner on the upper left wall, an ART booth display board with landscape paintings on the upper right, a central student comparing notes, a science lab bench on the left with colorful beakers and a clay volcano, an art craft desk on the right with paint jars and clay figures, hanging star decorations along the top ceiling edge, and a floor mat at the bottom. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the SCIENCE booth background sign panel color from sky blue to bright orange
2. Change the student's sweater vest in the center from sky blue to bright yellow
3. Change the clay volcano model on the science bench from brown clay to dark gray stone
4. Change the beaker liquid on the far left of the science bench from green to hot pink
5. Change the robot's eye lenses on the science display from dark gray to glowing cyan blue
6. Change the robot arm claw on the science display from 2 prongs to 3 prongs
7. Change the landscape painting in the upper right of the art wall to a night sky with a crescent moon
8. Remove the rightmost paintbrush from the blue jar on the art bench
9. Add a small bright green hat on top of the white clay figure on the art bench
10. Change the hanging star decoration on the ART booth sign from yellow to deep purple

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-dilemma-a.png`, `content/learning/source/en-dilemma-b.png`

---

### 3. [en-sustainability] - sustainability (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a vibrant school eco-festival scene. Diffuse ambient neon lighting fills the venue. Key elements arranged across grid zones include: rooftop solar panels in the upper left corner, paper lanterns along overhead string lights on the upper right, a central information board with eco-badges, a green recycling bin on the mid-left, a bicycle generator on the mid-right, an organic farm banner on the lower wall, wind turbine models, and a rain collection barrel in the lower corner. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the rooftop solar panel frame from silver to bright orange
2. Change the recycling bin lid from green to red
3. Change the student's safety vest from yellow to blue
4. Change the bicycle generator wheel from gray to lime green
5. Remove one potted plant from the eco-festival booth corner
6. Change the wind turbine blades from white to sky blue
7. Remove one paper lantern from the overhead string lights
8. Change the organic farm sign board from brown to teal
9. Change the rain collection barrel from dark green to purple
10. Remove one eco-badge sticker from the information board

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-sustainability-a.png`, `content/learning/source/en-sustainability-b.png`

---

### 4. [ko-proverb-dark-under-lamp] - dark under lamp (PROVERB)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of a cozy study room scene. Soft overhead desk lamp light focuses on the center desk. Key elements arranged across grid zones include: a wall clock in the upper left corner, a framed window with curtains in the upper right, a bookshelf loaded with colorful books on the left wall, a wooden desk in the center with a bright desk lamp, notebook, and pencil case, a student sitting on a chair, a checkered floor rug at the bottom, and a wastebasket in the lower corner. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the desk lamp shade from white to deep blue
2. Change the key's bow ring from gold to red
3. Change the student's sweater from gray to orange
4. Change the bookshelf wood color from light brown to dark walnut
5. Change the chair cushion from red to green
6. Remove one eraser from the pencil case on the desk
7. Change the wall clock frame from black to yellow
8. Change the notebook cover from blue to purple
9. Change the curtain color from beige to teal
10. Change the floor rug pattern from striped to checkered

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/ko-proverb-dark-under-lamp-a.png`, `content/learning/source/ko-proverb-dark-under-lamp-b.png`

---

### 5. [ko-proverb-seeing-is-believing] - seeing is believing (PROVERB)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of a clean science laboratory scene. Bright studio lighting illuminates from top center. Key elements arranged across grid zones include: a blackboard in a wooden frame on the upper left, a optical refraction chart poster in the upper right wall, a teacher's desk on the right with pencil containers, a main lab bench in the center with a glass prism on a stand, colorful test tube racks, an observation notebook, and students seated on wooden lab stools around the bench. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the prism glass stand from clear to amber
2. Change the student's lab coat from white to pale blue
3. Change the safety goggles strap from black to red
4. Change the observation notebook cover from yellow to green
5. Remove one test tube from the rack on the lab bench
6. Change the blackboard frame from dark brown to light gray
7. Change the refraction chart border from red to orange
8. Change the stool seat from brown to navy blue
9. Change the window blind from white to cream
10. Remove one pencil from the container on the teacher's desk

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/ko-proverb-seeing-is-believing-a.png`, `content/learning/source/ko-proverb-seeing-is-believing-b.png`

---

### 6. [ko-proverb-kind-words-return] - kind words return (PROVERB)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a warm classroom environment. Soft volumetric lighting radiates from top-center. Key elements arranged across grid zones include: a bulletin board in the upper left, a wall painting in a gold frame in the upper right corner, a wooden classroom door on the left, a student desk in the center with a flower vase and pencil holder, a cheerful student wearing a scarf talking to a teacher in a cardigan, window curtains on the right, and bookbags resting on the floor. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the student's scarf from red to teal
2. Change the teacher's cardigan from beige to navy blue
3. Change the classroom door from brown to white
4. Change the flower vase on the desk from blue to pink
5. Change the bulletin board frame from yellow to purple
6. Change the bookbag strap from black to orange
7. Change the wall painting frame from gold to silver
8. Change the pencil holder from red to green
9. Change the window curtain from striped to solid color
10. Change the chalk tray from white to light gray

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/ko-proverb-kind-words-return-a.png`, `content/learning/source/ko-proverb-kind-words-return-b.png`

---

### 7. [ko-idiom-turn-misfortune] - turn misfortune into blessing (IDIOM)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a cozy garden courtyard after rain. Gentle overcast sky lighting fills the scene. Key elements arranged across grid zones include: a wooden garden gate on the upper left, a welcome sign board on the upper right fence, a clay student figure in a yellow raincoat and boots in the center, rain puddles on the ground, a pile of fallen leaves, a sprout pot on the windowsill of the house on the right, broken umbrella in the yard corner, and a bird on a branch. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the student's raincoat from yellow to light green
2. Change the fallen leaf pile color from orange-red to golden yellow
3. Change the garden gate from dark brown to slate gray
4. Change the rain puddle shape from oval to crescent
5. Change the welcome sign board from red to blue
6. Remove one broken umbrella from the yard corner
7. Change the sprout pot on the windowsill from terracotta to white
8. Change the wooden fence plank from light wood to dark walnut
9. Change the bird's perch branch from gray to mossy green
10. Change the student's boots from black to dark green

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/ko-idiom-turn-misfortune-a.png`, `content/learning/source/ko-idiom-turn-misfortune-b.png`

---

### 8. [ko-idiom-prepare-ahead] - prepare ahead (IDIOM)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a futuristic emergency preparedness shelter. Bright ceiling neon lights spread evenly. Key elements arranged across grid zones include: a red emergency kit box on the upper left wall shelf, a wall-mounted fire extinguisher and signal mirror on the upper right, metallic storage shelves loaded with supply bags and water barrels, a safety helmet on the central desk, an emergency flashlight and rope coil in the foreground, and a first aid station logo on the back wall. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the emergency kit box from red to dark blue
2. Change the water barrel lid from gray to orange
3. Change the safety helmet from white to yellow
4. Change the first aid cross symbol from red to green
5. Change the storage shelf from silver to brown
6. Change the emergency flashlight from black to bright red
7. Change the rope coil from white to beige
8. Change the supply bag from olive green to navy
9. Change the fire extinguisher body from red to silver
10. Change the signal mirror frame from gold to chrome

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/ko-idiom-prepare-ahead-a.png`, `content/learning/source/ko-idiom-prepare-ahead-b.png`

---

### 9. [ko-idiom-perspective] - perspective taking (IDIOM)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of an interactive classroom role-reversal activity room. Balanced ceiling lighting. Key elements arranged across grid zones include: a round wall clock in the upper left, a role-swap sign banner on the upper right wall, a chalkboard with white writing, window blinds on the right wall, desk nameplates, students and teacher interacting across central desks, a purple floor mat, and a potted plant in the lower corner. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the classroom role-swap sign from yellow to red
2. Change one student's shirt from blue to orange
3. Change the teacher's pointer stick from brown to black
4. Change the classroom partition curtain from white to striped
5. Change the desk nameplate frame from silver to gold
6. Change the floor mat from green to purple
7. Change the chalk writing color on the board from white to yellow
8. Change the window blinds from horizontal to vertical style
9. Change the clock face from round to square shape
10. Change the potted plant pot from terracotta to white

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/ko-idiom-perspective-a.png`, `content/learning/source/ko-idiom-perspective-b.png`

---

### 10. [en-phonics-apple] - apple (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of a colorful apple orchard fruit orchard study station. Soft, even daylight fills the sky without direct sun glare. Key elements arranged across grid zones include: apple tree branches with green leaves and hanging apples in the upper left, an wooden orchard entrance arch with a sign in the upper center, a small price tag on a tree branch in the upper right, a large featured red apple on a center wooden table, a wicker fruit basket, a wooden fruit bowl on the right, and fallen apples on the grass ground. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the large featured apple color from bright red to deep golden yellow
2. Change the apple leaf shape from pointed oval to a three-lobed clover shape
3. Change the wicker fruit basket color from natural straw to dark navy blue
4. Remove one small green apple from the upper-left background branch
5. Change the wooden fruit bowl on the right table from light pine to terracotta orange
6. Remove the cast shadow beneath the center display apple on the table surface
7. Change the apple stem from short and stubby to long and curved
8. Add one small green caterpillar on the rightmost apple hanging from the tree
9. Remove the small white price tag label hanging from the basket handle
10. Change the circular highlight shine spot on the main apple from white to pale gold

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-phonics-apple-a.png`, `content/learning/source/en-phonics-apple-b.png`

---

### 11. [gk-space-rover] - space rover (GENERAL_KNOWLEDGE)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of an alien planet Mars surface exploration site. Diffuse ambient planetary lighting illuminates the landscape without direct sun glare. Key elements arranged across grid zones include: distant reddish Martian mountains in the upper left, an orbital space station module hovering in the upper center sky, a communications satellite in the upper right sky, a metallic space rover with 6 wheels, dish antenna, and solar panels in the central foreground, impact craters on the ground, an astronaut figure near a rock formation, and scattered boulders across the reddish terrain. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the rover body hull primary color from silver-gray to bright orange
2. Change the main communications antenna from a dish shape to a tall vertical rod
3. Remove the small mission flag mounted on the rover's left side panel
4. Change the solar panel surface color from dark blue to shimmering gold
5. Change the number of large drive wheels visible from 6 to 4
6. Change the rover camera lens housing color from black to bright red
7. Remove one large impact crater from the Mars terrain in the mid-background
8. Add one small rounded boulder beside the rover's front right wheel
9. Change the status signal light on the rover's top from green to amber orange
10. Remove the astronaut figure standing beside the distant rock formation in the background

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/gk-space-rover-a.png`, `content/learning/source/gk-space-rover-b.png`

---

### 12. [ko-proverb-cow-barn] - lock stable after horse bolted (PROVERB)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a traditional farmyard barn scene. Soft morning overcast daylight illuminates the farmyard without direct sun glare. Key elements arranged across grid zones include: a weather vane on the barn rooftop ridge in the upper left, a wooden barn central cupola tower in the upper center, a wooden barn window frame on the upper right, a large wooden barn door in the center background, a cow with a bell collar, hay bales and water trough on the left, a farmer with a straw hat repair working on a wooden fence, a chicken on the ground, and a horseshoe hanging on the wall. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the barn door color from red to dark brown
2. Change the cow's collar bell from gold to silver
3. Remove one hay bale from outside the barn entrance
4. Change the fence wooden rail from light wood to dark walnut
5. Change the farmer's straw hat ribbon from blue to red
6. Add one small bucket next to the water trough
7. Remove one chicken from the farmyard
8. Add one crow sitting on the barn rooftop ridge
9. Change the barn window frame from white to yellow
10. Remove one horseshoe hanging on the barn wall

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/ko-proverb-cow-barn-a.png`, `content/learning/source/ko-proverb-cow-barn-b.png`

---

### 13. [ko-idiom-birds-one-stone] - kill two birds with one stone (IDIOM)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a playful park target practice scene. Diffuse neon ambient lighting overhead. Key elements arranged across grid zones include: fluffy tree canopy in the upper left with perched birds, a crescent moon in the upper right sky, a boy with a slingshot standing in the center, tree branches holding stone target markers on the right, green grass ground with small bushes, flowers, butterflies, and wild mushrooms at the base of the trees. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the slingshot handle color from brown to red
2. Change the bird on the right branch from a sparrow to a pigeon shape
3. Change the stone target marker from gray to bright orange
4. Remove one bird from the left tree branch
5. Change the boy's cap from blue to green
6. Remove one bush from the foreground right side
7. Change the ground patch grass from light green to dark green
8. Add one small butterfly near the flower bed
9. Change the tree trunk bark texture from smooth to rough
10. Add one small mushroom at the base of the left tree

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/ko-idiom-birds-one-stone-a.png`, `content/learning/source/ko-idiom-birds-one-stone-b.png`

---

### 14. [en-school-classroom] - classroom (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of a vibrant elementary classroom. Soft overhead studio lighting. Key elements arranged across grid zones include: a wall clock in the upper left corner, a colorful alphabet poster in the upper right, a large dark green blackboard in the center back wall, student desks with orange plastic chairs, a teacher standing at the front desk with a pencil, students sitting in rows, window blinds on the right, and a potted plant on the left windowsill. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the blackboard surface color from dark green to classic jet black
2. Change the student chairs from orange plastic to bright cobalt blue
3. Change the teacher's cardigan from beige gray to mustard yellow
4. Remove the small potted plant from the left corner of the windowsill
5. Change the wall clock hands from pointing 10:10 to pointing 3:15
6. Remove the colorful alphabet poster from the center of the back wall
7. Change the front-row student's cap from blue to bright red
8. Change the pencil in the teacher's hand from yellow to red
9. Add one brown school bag leaning against the right side of the teacher's desk
10. Change the window blinds from fully open to halfway closed

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-school-classroom-a.png`, `content/learning/source/en-school-classroom-b.png`

---

### 15. [en-happy-family] - family (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of a sunny family park picnic. Soft, warm daylight shines diffusely without direct sun glare. Key elements arranged across grid zones include: a diamond-shaped kite flying in the upper left sky, a fluffy cloud formation in the upper center sky, an apple tree in the upper right background, a red-and-white checkered picnic blanket spread in the center, a mom in a sundress, dad holding a straw hat, child holding a balloon, a golden retriever dog, a wicker food basket, and a wooden park bench on the far left. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the dad's polo shirt from light blue to bright orange
2. Change the mom's sundress from yellow to soft lavender
3. Change the child's round balloon from red to bright teal
4. Remove the golden retriever dog sitting beside the picnic blanket
5. Change the picnic blanket pattern from red-and-white checkered to solid red
6. Change the food picnic basket color from natural wicker to dark forest green
7. Remove the dad's wide-brim straw hat from the scene
8. Change the diamond-shaped kite color from blue to hot pink and white
9. Change the apple in the background tree from red to golden yellow
10. Add one wooden park bench to the far left background behind the family

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-happy-family-a.png`, `content/learning/source/en-happy-family-b.png`

---

### 16. [en-curiosity-lab] - curiosity (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of an active young researchers lab. Even overhead lab ceiling lighting. Key elements arranged across grid zones include: a research chart pinned to the upper left wall board, a star sticker on the upper right window pane, a main experiment bench in the center with glass flasks of colorful chemical liquids, a microscope, safety goggles, young researchers in white coats, a clay robot toy, a stack of books, and a potted succulent on a shelf. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the lead researcher's lab coat from white to pale sky blue
2. Change the chemical reaction liquid in the center flask from green to bright orange
3. Change the microscope body color from silver-black to bright red
4. Remove the research chart pinned to the left wall board
5. Add one tall cylindrical glass beaker to the right side of the lab bench
6. Change the safety goggles strap color from black to bright yellow
7. Change the small potted succulent on the shelf from green to purple
8. Change the clay robot toy on the desk from gray to bright yellow
9. Change the stack of books on the corner desk from red to teal blue
10. Remove the star sticker from the upper right corner of the window pane

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-curiosity-lab-a.png`, `content/learning/source/en-curiosity-lab-b.png`

---

### 17. [en-ambiguity-gallery] - ambiguity (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of an optical illusion art gallery. Soft spotlighting from top center. Key elements arranged across grid zones include: an abstract clay sculpture on a pedestal in the upper left corner, a green EXIT sign in the upper right wall corner, large framed optical illusion paintings in the center gallery wall, museum benches with cushions, visiting students in red jackets, decorative vases near the entrance, and window drape curtains. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the painting frame color from dark wood brown to bright gold
2. Change the central optical illusion artwork from black-and-white to blue-and-orange tones
3. Change the visiting student's jacket from red to forest green
4. Remove the abstract clay sculpture from its pedestal on the left side
5. Change the overhead spotlight glow color from warm white to cool blue
6. Change the museum bench cushion color from beige to deep burgundy
7. Remove the green EXIT sign from the top right corner of the wall
8. Add one small framed abstract painting to the empty wall space on the far right
9. Change the decorative vase near the gallery entrance from white to cobalt blue
10. Change the window drape curtain from dark red to olive green

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-ambiguity-gallery-a.png`, `content/learning/source/en-ambiguity-gallery-b.png`

---

### 18. [en-toy-hospital] - hospital (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a playful futuristic toy hospital ward. Soft warm ambient glow centered overhead. Key elements arranged across grid zones include: a small potted plant in the upper left corner shelf, a wall medical monitor in the upper right, a white hospital bed frame in the center with a patient teddy bear, a toy doctor in a white coat with stethoscope, a nurse figurine with a cap, medicine bottles, bandage wraps, and a thermometer on a side tray. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the toy doctor's coat from white to light sky blue
2. Change the patient teddy bear's fur color from brown to pure white
3. Change the stethoscope tube color from black to bright red
4. Change the medicine bottle label color from orange to lime green
5. Change the bandage wrap on the arm from plain white to light pink
6. Remove the glass thermometer resting beside the hospital toy bed
7. Change the nurse figurine's cap from white to soft lavender
8. Change the hospital bed frame color from white to soft mint green
9. Add one clipboard medical chart hanging at the foot of the bed
10. Remove the small potted plant from the corner of the hospital room

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-toy-hospital-a.png`, `content/learning/source/en-toy-hospital-b.png`

---

### 19. [en-city-park] - park (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of a lively city park playground. Soft, even daylight fills the park without direct sun glare. Key elements arranged across grid zones include: a cherry blossom tree in full bloom in the upper left corner, a decorative wooden park entrance arch in the upper center, a yellow hot air balloon in the upper right sky, a yellow slide, blue swings, a stone water fountain in the center, park benches, a child flying a red kite, a golden retriever dog with a collar, and a lamp post. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the playground slide color from yellow to bright red
2. Change the swing seat color from blue to bright orange
3. Remove the white rubber duck floating in the park fountain
4. Change the park bench wood stain color from light oak to dark walnut
5. Change the kite color from red to purple and white stripes
6. Change the cherry blossom tree flower color from pink to bright white
7. Change the golden retriever dog's collar from red to bright green
8. Remove the round stone water fountain from the center of the park
9. Add one large yellow hot air balloon visible above in the sky
10. Change the lamp post color from black iron to dark forest green

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-city-park-a.png`, `content/learning/source/en-city-park-b.png`

---

### 20. [en-yellow-bus] - bus (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of a school entrance with a yellow school bus. Soft sky lighting centered overhead. Key elements arranged across grid zones include: a white pigeon on the upper left school gate fence, a fluffy white cloud in the upper right sky, a bright yellow school bus in the center with silver window frames, a driver in a navy uniform, boarding students with backpacks, a red STOP sign arm, black iron fences, and a garden bed of sunflowers. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the school bus window frame color from silver to bright orange
2. Change the bus driver's uniform cap from dark navy to bright red
3. Change the boarding student's uniform sweater from navy blue to green
4. Change the stop arm sign mounted on the bus from red to bright yellow
5. Change the rear wheel sidewall from black to white-walled tire
6. Change the student's backpack color from orange to purple
7. Remove the white pigeon bird perched on the school gate fence top
8. Change the school gate fence color from black iron to silver gray
9. Add one white fluffy cloud directly above the school bus roof
10. Remove one yellow sunflower from the garden bed near the school gate

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-yellow-bus-a.png`, `content/learning/source/en-yellow-bus-b.png`

---

### 21. [en-funny-zoo] - zoo (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a cheerful cartoon zoo habitat. Soft, warm daylight fills the zoo without direct sun glare. Key elements arranged across grid zones include: a tall giraffe with brown spots in the upper left enclosure, a decorative zoo entrance gate arch with a animal sign in the upper center, a tropical parrot in a tree on the upper right, a lion with a golden mane in the center, an elephant wearing a party hat, a monkey swinging from a bar, a visitor info sign post, an ice cream vendor, and a zookeeper. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the giraffe's spot pattern color from dark brown to deep orange
2. Change the elephant's novelty party hat from red to bright lime green
3. Change the monkey's tail tip color from brown to pale cream yellow
4. Change the lion's mane color from golden orange to deep auburn brown
5. Change the zoo entrance gate arch color from brown to bright sky blue
6. Change the tropical parrot's feathers from red to bright golden yellow
7. Change the decorative cage bars color from silver to shiny gold
8. Remove the visitor information sign from the zoo entrance post
9. Change the ice cream cone in the vendor's hand from pink to mint green
10. Change the zookeeper's uniform color from khaki to navy blue

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-funny-zoo-a.png`, `content/learning/source/en-funny-zoo-b.png`

---

### 22. [en-sweet-bakery] - bakery (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a cozy sweet bakery shop. Warm interior shop lighting centered above. Key elements arranged across grid zones include: a potted lavender plant on the upper left window sill, a brown hanging bakery sign board in the upper right corner, a glass display case in the center filled with celebration cakes, bread loaves, sugar cookies, and cupcakes, a baker in a white chef hat, a serving tray, and decorative window frames. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the large celebration cake frosting color from pink to bright turquoise
2. Change the bread loaf shape from round boule to elongated baguette
3. Remove one sugar cookie from the front display tray in the case
4. Change the baker's tall chef hat color from white to bright red
5. Change the glass display case frame color from silver to warm gold
6. Change the cupcake topping from chocolate swirl to rainbow sprinkles
7. Change the hanging bakery sign board color from brown wood to bright yellow
8. Add one small potted lavender plant on the left side of the window sill
9. Change the window frame color from white to dark teal
10. Change the serving tray shape from rectangular to oval

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-sweet-bakery-a.png`, `content/learning/source/en-sweet-bakery-b.png`

---

### 23. [en-summer-beach] - beach (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a sunny summer beach resort. Bright, diffuse coastal daylight illuminates the beach without direct sun glare. Key elements arranged across grid zones include: a seagull in the upper left sky, a tropical palm tree canopy in the upper center, a lifeguard tower in the upper right background, a striped beach umbrella, inflatable beach ball, and surfboard in the center sand, sandcastles with a small red crab on the right, swimmers in the turquoise waves, and sand buckets with spades. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the beach umbrella from red and white stripes to solid bright blue
2. Change the inflatable beach ball color from yellow to orange and white
3. Change the surfboard design from plain white to bright green with diagonal stripes
4. Remove one large spiral seashell from the foreground sand
5. Change the lifeguard tower color from bright red to white
6. Change the swimmer's swimsuit color from blue to hot pink
7. Add one small red crab walking beside the sandcastle on the right
8. Change the sand bucket and spade set color from blue to bright yellow
9. Change the breaking wave crest color from white foam to light turquoise
10. Remove one seagull from the upper left section of the sky

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-summer-beach-a.png`, `content/learning/source/en-summer-beach-b.png`

---

### 24. [en-space-rocket] - rocket (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of a night space launch pad. Soft starlight diffuse across the night sky. Key elements arranged across grid zones include: a weather satellite in the upper left sky, a star cluster and crescent moon in the upper right sky, a white space rocket with exhaust flames on a central launch gantry tower, an astronaut in a spacesuit, mission flags, and solid fuel boosters attached to the rocket. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the rocket body primary color from white to bright red
2. Change the exhaust flame color from orange-yellow to bright blue-white
3. Change the star cluster on the right side of the scene from scattered dots to a clear Big Dipper shape
4. Change the crescent moon shape to a full circle moon
5. Change the astronaut's spacesuit color from white to warm gold
6. Change the launch gantry tower color from gray to dark green
7. Remove the small weather satellite visible in the far background sky
8. Change the mission flag colors from red and white to blue and gold
9. Remove one solid fuel booster from the rocket's lower stage
10. Add one round porthole window to the upper body section of the rocket

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-space-rocket-a.png`, `content/learning/source/en-space-rocket-b.png`

---

### 25. [en-sustainability-greenhouse] - sustainability (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of an eco-friendly greenhouse. Soft sky illumination centered directly overhead. Key elements arranged across grid zones include: solar panels on the upper left roof glass, a blue recycling bin in the upper right interior, a center pathway flanked by lush organic plants, a worker wearing dark blue overalls, watering cans, compost bins, and an irrigation arm. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the solar panel surface color from dark navy blue to bright teal
2. Change the large leafy plant in the greenhouse center from dark green to bright lime green
3. Change the watering can color from dark green to bright orange
4. Remove the blue recycling bin from the left side of the greenhouse path
5. Change the worker's overalls color from dark blue to light sage green
6. Add one monarch butterfly resting on the center flower cluster
7. Change the compost bin color from brown to dark charcoal gray
8. Change the greenhouse roof glass tint from clear to soft sky blue
9. Remove the sprinkler head attachment from the right-side irrigation arm
10. Change the sunlight ray pattern from straight parallel beams to a fan-shaped burst

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-sustainability-greenhouse-a.png`, `content/learning/source/en-sustainability-greenhouse-b.png`

---

### 26. [en-architecture-studio] - architecture (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a modern architect's design studio. Balanced studio ceiling lighting. Key elements arranged across grid zones include: studio windows in the upper left background wall, building posters on the upper right, a center drafting table with building blueprints and scale models, desk lamps, pencils, hard hats, and computer monitors displaying 3D renders. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the large blueprint paper color from white to pale cyan
2. Change the architectural scale model building color from white plaster to warm terracotta
3. Change the desk lamp shade color from black to bright yellow
4. Remove the long scale ruler from the drafting table surface
5. Change the set of pencils on the desk from yellow to red
6. Change the studio chair color from black to forest green
7. Change the computer monitor display from blueprint view to a 3D model render view
8. Add one small succulent plant on the left corner of the architect's desk
9. Change the construction hard hat color from yellow to bright orange
10. Remove the left-side studio window from the background wall

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-architecture-studio-a.png`, `content/learning/source/en-architecture-studio-b.png`

---

### 27. [en-ecosystem-coral] - ecosystem (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a vibrant underwater coral reef ecosystem. Soft water surface sunbeams centered from above. Key elements arranged across grid zones include: a sea turtle swimming in the upper left water, translucent jellyfish in the upper right, orange coral formations in the center sea floor, tropical clownfish, sea anemones, deep sea diver, seaweed, conch shell, and starfish on the bottom rocks. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the main coral formation color from orange to bright hot pink
2. Change one large tropical fish species from a clownfish orange-and-white to a blue tang blue
3. Remove the large green sea turtle swimming in the upper background
4. Change the jellyfish color from translucent blue to bright purple
5. Add one sea anemone cluster to the empty rocky area on the right side
6. Change the deep sea diver's wetsuit color from black to bright yellow
7. Change the tall seaweed color from dark green to teal
8. Remove the large speckled conch shell from the sandy sea floor
9. Change the bubble trail pattern from scattered dots to a tight straight column
10. Change the orange starfish on the rock from orange to bright crimson red

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-ecosystem-coral-a.png`, `content/learning/source/en-ecosystem-coral-b.png`

---

### 28. [en-astronomy-observatory] - observatory (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a high-tech night sky observatory. Cool moonlight centered above through the open dome. Key elements arranged across grid zones include: a white observatory dome shell on the upper left, projected star charts in the upper right, a giant silver telescope mounted in the center, astronomer in a research coat, planet posters, eyepiece lenses, observation chairs, and clipboards. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the main telescope body color from silver to deep navy blue
2. Change the observatory dome outer shell color from white to soft gold
3. Change the projected star chart pattern from random scattered stars to an Orion constellation shape
4. Change the astronomer's research coat color from white to dark olive green
5. Change the planet poster on the wall from showing Saturn to showing Jupiter
6. Change the telescope eyepiece housing color from silver to bright red
7. Remove the printed data chart from the clipboard resting on the table
8. Change the observation chair color from black to bright blue
9. Add one vintage brass oil lantern on the floor beside the telescope base
10. Change the visible moon position through the dome opening from upper right to upper left

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-astronomy-observatory-a.png`, `content/learning/source/en-astronomy-observatory-b.png`

---

### 29. [en-archaeology-dig] - archaeology (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of an outdoor archaeological dig site. Diffuse, even daylight illuminates the dig site without direct sun glare. Key elements arranged across grid zones include: a field tent in the upper left corner, a stone arch gateway in the upper center background, a site identification sign board in the upper right, an excavation trench grid in the center with fossil discoveries, an archaeologist in a straw sun hat, soft brushes, trowels, shovels, and artifact display tables. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the archaeologist's wide-brim field hat color from beige to bright red
2. Change the soft bristle brush handle color from brown to bright blue
3. Change the fossil shape on the excavation grid from a spiral ammonite to a flat fish skeleton
4. Change the field tent color from olive green to sandy beige
5. Remove one digging trowel from the tool collection beside the trench
6. Add one ancient clay pottery shard to the display table beside the dig
7. Change the excavation grid rope color from white to bright orange
8. Change the site identification sign board color from brown to white
9. Change the long-handled shovel blade from silver to dark charcoal gray
10. Remove the large straw sun hat from the resting position on the fence post

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-archaeology-dig-a.png`, `content/learning/source/en-archaeology-dig-b.png`

---

### 30. [en-symphony-orchestra] - symphony (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of a grand symphony orchestra performance on stage. Even theater ceiling spotlights centered above. Key elements arranged across grid zones include: hanging stage lights on the upper left, a stage backdrop curtain on the upper right, a conductor with a baton at the center podium, violinists, cellists, french horn players, a grand piano on the far right, music stands, and sheet music. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the conductor's baton color from white to bright gold
2. Change the violin body wood finish from dark rosewood to bright orange amber
3. Change the cello bow to show a slight visible curve rather than being straight
4. Change the music stand color from black to dark mahogany brown
5. Change the stage backdrop curtain from deep red to royal blue
6. Change the French horn color from brass gold to polished silver
7. Change the lead violinist's concert dress color from black to deep emerald green
8. Change the sheet music paper on stands from white to pale yellow
9. Change the main overhead spotlight color from warm white to cool cyan blue
10. Add one grand piano visible at the far right edge of the orchestra stage

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-symphony-orchestra-a.png`, `content/learning/source/en-symphony-orchestra-b.png`

---

### 31. [en-hypothesis-lab] - hypothesis (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a scientific hypothesis research laboratory. Balanced overhead lab lighting. Key elements arranged across grid zones include: a data chart pinned to the upper left wall, a digital countdown timer display on the upper right, experiment benches in the center with glass flasks, beakers, microscopes, safety goggles, researchers in lab coats, plant growth containers, and spiral research notebooks. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the lead researcher's lab coat color from white to light sky blue
2. Change the chemical reaction liquid in the center flask from yellow to bright green
3. Change the whiteboard diagram from an algebraic formula to a bar graph drawing
4. Remove one large glass beaker from the left side of the experiment bench
5. Change the safety goggle lens tint from clear to light orange
6. Change the plant growth experiment container from a round pot to a rectangular seedling tray
7. Add one spiral-bound research notebook to the right side of the desk
8. Change the digital countdown timer display color from red to green
9. Change the microscope eyepiece lens ring color from silver to bright gold
10. Change the data chart on the back wall from bar chart style to a line graph style

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-hypothesis-lab-a.png`, `content/learning/source/en-hypothesis-lab-b.png`

---

### 32. [en-journalism-press] - journalism (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a busy journalism press newsroom. Studio key lights centered overhead. Key elements arranged across grid zones include: a world map poster on the upper left wall, a wall clock in the upper right, news anchor desks in the center with microphones, open notepads, reporters in blazers, broadcast cameras on tripods, press badges, and side studio monitors. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the on-air reporter's blazer jacket color from dark navy to bright red
2. Change the broadcast camera body color from black to dark olive green
3. Change the studio microphone housing color from silver to gold
4. Change the news anchor desk color from dark wood to bright white
5. Remove the monitor screen from the right side of the news broadcast set
6. Add one open reporter's notepad to the desk in front of the news anchor
7. Change the background wall map from a world map to a city street map
8. Change the studio key light color from warm white to cool blue
9. Change the press badge lanyard color from red to bright yellow
10. Remove the wall clock from above the studio entrance door

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-journalism-press-a.png`, `content/learning/source/en-journalism-press-b.png`

---

### 33. [en-metaphor-library] - metaphor (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a surreal fantasy library with floating books. Soft ethereal glow centered above. Key elements arranged across grid zones include: a spiral staircase in the upper left, hanging brass chandeliers in the upper right, floating book clusters glowing in the center, bookshelves loaded with tomes, a terrestrial globe, desk reading lamps, a librarian in academic robes, and comfortable reading chairs. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the floating book cluster glow color from gold to bright teal
2. Change one horizontally floating book cover from blue to bright red
3. Change the librarian's academic robes color from dark purple to forest green
4. Change the bookshelf wood color from dark oak to warm walnut
5. Change the reading desk lamp shade color from amber to cool white
6. Remove the large terrestrial globe from the reference desk corner
7. Change the magnifying glass handle color from silver to bright gold
8. Change the reading chair upholstery color from red leather to navy blue
9. Add one small climbing vine plant winding up the left bookshelf column
10. Change the spiral staircase railing color from gold to deep bronze

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-metaphor-library-a.png`, `content/learning/source/en-metaphor-library-b.png`

---

### 34. [en-paradox-labyrinth] - paradox (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of an impossible geometric labyrinth maze. Mysterious overhead central lighting. Key elements arranged across grid zones include: arched windows in the upper left wall, floating platforms in the upper right, impossible staircases ascending in different directions in the center, stone arch bridges, support pillars, small explorer figures, suspended rope bridges, and ornate doors. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the impossible staircase primary ascending direction from going right to going left
2. Change the arch bridge stone color from light gray to warm terracotta
3. Change one small figure's position from standing on a staircase step to standing on a bridge
4. Remove one arched window from the upper left section of the labyrinth wall
5. Add one suspended rope bridge connecting two previously disconnected platforms
6. Change the central support pillar color from dark stone gray to bright white marble
7. Change the large ornate door color from brown wood to jet black
8. Change the primary light source direction from upper left to directly overhead center
9. Change the small figure's shadow direction from pointing right to pointing forward
10. Change the floor tile pattern from a diamond grid to a hexagonal honeycomb

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-paradox-labyrinth-a.png`, `content/learning/source/en-paradox-labyrinth-b.png`

---

### 35. [en-serendipity-garden] - serendipity (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of a magical clover botanical garden. Soft morning daylight illuminates the garden diffusely without direct sun glare. Key elements arranged across grid zones include: a rainbow arc in the upper left sky, a central decorative stone garden archway in the upper center, bird baths on the upper right, giant four-leaf clovers in the central garden bed, stone water fountains, garden benches, fluttering butterflies, glowing fairies, iron garden gates, and wild mushrooms. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the large four-leaf clover color from bright green to golden yellow
2. Change the large butterfly resting on the flower from orange to bright blue
3. Change the stone fountain basin water color from gray-blue to bright turquoise
4. Remove one tall sunflower from the right side of the garden border
5. Change the garden bench color from light green to bright red
6. Add one small glowing fairy hovering near the left flower cluster
7. Change the garden gate color from dark iron to warm gold
8. Change the rainbow in the background from a full arc to a half arc on the left side only
9. Remove one small sparrow bird from the bird bath on the right
10. Add one cluster of red mushrooms beside the stone path on the far left

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-serendipity-garden-a.png`, `content/learning/source/en-serendipity-garden-b.png`

---

### 36. [en-synergy-cradle] - synergy (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a high-tech collaborative design studio. Soft overhead ambient lighting. Key elements arranged across grid zones include: company logos on the upper left wall, window views of city skylines in the upper right, central presentation screens, team members working at collaborative desks, robotic arm prototypes, holographic 3D model displays, coffee cups, and office chairs. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the large presentation screen background color from blue to bright orange
2. Change the collaborative desk arrangement from an L-shape to a straight linear row
3. Change the team member's sweater color from gray to bright purple
4. Change the robotic arm color from silver to bright teal
5. Remove the holographic 3D model display from the center of the workspace
6. Add one ceramic coffee cup on the rightmost team member's desk
7. Change the office chair upholstery color from black to forest green
8. Change the background window view from a city skyline to a mountain landscape
9. Remove the small potted plant from the far left corner of the studio
10. Change the company logo color on the back wall from blue to bright red

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-synergy-cradle-a.png`, `content/learning/source/en-synergy-cradle-b.png`

---

### 37. [en-resilience-garden] - resilience (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a post-rain recovery garden. Soft post-storm daylight shines diffusely without direct sun glare. Key elements arranged across grid zones include: fluffy clouds in the upper left sky, a full rainbow arc spanning the upper center sky, fence posts with perched canary birds in the upper right, freshly repaired flower beds in the center, rain puddles, young green sprouts, fluttering butterflies, wooden fences, and a gardener wearing an apron. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the rainbow arc colors to include an extra outer purple band not present before
2. Change the flower bed on the left from red roses to bright yellow sunflowers
3. Remove one small green sprout from the freshly repaired garden bed
4. Change the rain puddle shape from circular to elongated oval
5. Add one small yellow canary bird perched on the fence post
6. Change the butterfly near the flower from orange to bright blue
7. Change the wooden fence color from natural brown wood to white painted
8. Change the fluffy cloud in the upper sky from a rounded cumulus to a flat anvil-top shape
9. Change the birdhouse position from the left fence post to the central garden trellis
10. Change the gardener's apron color from green to bright pink

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-resilience-garden-a.png`, `content/learning/source/en-resilience-garden-b.png`

---

### 38. [en-nostalgia-attic] - nostalgia (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a cozy attic filled with vintage treasures. Warm hanging amber lamp light centered overhead. Key elements arranged across grid zones include: travel posters on the upper left wall, arched attic windows with curtains in the upper right, old travel trunks and toy storage boxes in the center, vintage toy cars, wooden photo frames, music boxes, stuffed teddy bears, letter boxes, and antique wall clocks. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the vintage toy car color from red to bright blue
2. Change the wooden photo frame shape from rectangular to oval
3. Change the old travel trunk color from brown leather to dark green
4. Change the music box lid from plain light wood to dark walnut and add a visible ballerina figure
5. Change the hanging attic lamp shade color from amber to clear glass
6. Remove one large stuffed teddy bear from the fabric storage trunk
7. Change the wooden letter box color from red to mustard yellow
8. Change the attic window curtain fabric from white lace to plaid pattern
9. Change the antique wall clock face from Roman numerals to standard Arabic numerals
10. Add one vintage travel poster to the left attic wall beside the window

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-nostalgia-attic-a.png`, `content/learning/source/en-nostalgia-attic-b.png`

---

### 39. [en-epiphany-lighthouse] - epiphany (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of a coastal lighthouse at night. A bright golden beacon beam shines from the top center lantern room. Key elements arranged across grid zones include: star constellations in the upper left sky, small distant sailboats in the upper right sea, a tall stone lighthouse in the central foreground, lighthouse keeper in a navy coat, lantern cupola, rocky shorelines, crashing waves, windows with warm glow, and brass entrance bells. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the lighthouse beacon beam color from white to warm golden yellow
2. Change the lighthouse keeper's coat color from dark navy to bright red
3. Change the lantern room cupola housing color from dark gray to bright orange
4. Remove the small sailboat from the water visible in the distance
5. Change the rocky shoreline stone color from dark gray to warm brown
6. Change the ocean wave height from medium rolling waves to tall cresting waves
7. Change the visible star constellation in the sky from scattered stars to a clear Big Dipper pattern
8. Change the lighthouse window glow color from warm yellow to cool blue
9. Remove the large brass bell mounted beside the lighthouse door
10. Change the main lighthouse entry door color from red to dark green

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-epiphany-lighthouse-a.png`, `content/learning/source/en-epiphany-lighthouse-b.png`

---

### 40. [en-equilibrium-cliff] - equilibrium (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of a serene zen balancing rock cliff. Soft diffuse lighting centered overhead. Key elements arranged across grid zones include: fluffy clouds in the upper left sky, soaring crane birds in the upper right, a large stack of balanced cairn stones in the center, a meditating monk in saffron robes, twisted pine trees, brass balance scales, waterfalls, stone cairns, and rope bridges. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the large stacked balancing stones color from gray to warm terracotta
2. Change the hanging brass balance scale from an even horizontal balance to slightly tilted left
3. Change the large fluffy cloud position from center right to center left of the scene
4. Change the twisted pine tree silhouette from a single trunk to a forked double trunk
5. Change the meditating monk's robe color from saffron orange to deep purple
6. Change the small waterfall cascade appearance from white to light blue tinted
7. Remove one white crane bird from its standing position beside the pine tree
8. Change the stone cairn stack from 4 stones to 6 stones
9. Change the wildflower cluster color from yellow to bright pink
10. Change the rope suspension bridge from single-rope style to wooden-plank-and-rope style

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-equilibrium-cliff-a.png`, `content/learning/source/en-equilibrium-cliff-b.png`

---

### 41. [en-transmutation-alchemist] - transmutation (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a mystical alchemist laboratory. Magical green particle light radiates from the center. Key elements arranged across grid zones include: transmutation symbols on the upper left wall, hanging potion jars on the upper right, an alchemist in ceremonial robes at the central wooden desk, glowing alchemy flasks, leather tome books, iron cauldrons, raw emerald gems, smoke, and runic floor inscriptions. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the central alchemical flask body color from clear glass to deep amber
2. Change the glowing particle effect color rising from the potion from green to bright purple
3. Change the transmutation symbol on the wall from a circle-with-triangle to a Star of David
4. Change the alchemist's long ceremonial robe color from brown to deep navy blue
5. Change the old tome book cover color from brown leather to red leather
6. Remove the large iron cauldron from the left side of the laboratory
7. Add one large raw emerald gem on the stone table beside the main apparatus
8. Change the alchemical smoke rising from the flask from white to deep violet purple
9. Change the runic inscription pattern on the floor from circular rings to a hexagonal shape
10. Change the wooden experiment table color from dark oak to pale ash

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-transmutation-alchemist-a.png`, `content/learning/source/en-transmutation-alchemist-b.png`

---

### 42. [en-transcendence-galaxy] - transcendence (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a cosmic space galaxy landscape. Golden divine rays centered from deep space. Key elements arranged across grid zones include: orbital space stations in the upper left, ringed planets in the upper right, a swirling spiral galaxy in the center, floating astronauts, colorful nebula clouds, black holes, streaking comets, and star constellations. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the spiral galaxy central glow color from blue-white to warm golden
2. Change the visible star cluster formation from a scattered cloud to a tight compact globular cluster
3. Remove the large ringed planet from the upper right portion of the scene
4. Change the floating astronaut's spacesuit color from white to deep navy blue
5. Change the nebula cloud color from pink-purple to bright teal
6. Change the black hole position from center left to lower center of the scene
7. Add one long-tailed comet streaking from the upper right toward the center
8. Change the divine light ray beam color from golden to bright cyan
9. Remove the orbital space station from the background
10. Change the visible constellation pattern from a horizontal straight line to a zigzag formation

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-transcendence-galaxy-a.png`, `content/learning/source/en-transcendence-galaxy-b.png`

---

### 43. [en-phenomenon-lab] - phenomenon (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a natural phenomenon science observation station. Vibrant green aurora curtains drape the upper sky. Key elements arranged across grid zones include: aurora borealis in the upper left sky, weather sensor antennas on the upper right roof, a weather simulation chamber in the center with lightning bolts and clouds, researchers in lab coats and helmets, oscilloscope monitors, crystal specimens, and measurement towers. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the aurora borealis curtain colors from bright green to vivid purple-pink
2. Change the visible lightning bolt shape from a forked multi-branch to a single straight bolt
3. Change the researcher's lab coat color from white to bright orange
4. Change the monitor screen display from a waveform oscilloscope graph to a world map
5. Change the crystal formation color from clear transparent to deep blue
6. Remove one weather sensor antenna from the top of the monitoring station
7. Change the cloud formation in the simulation chamber from cumulus to a cumulonimbus anvil shape
8. Change the researcher's protective helmet color from gray to bright yellow
9. Change the tall measurement antenna tower color from silver to bright red
10. Change the data chart display from a bar graph to a circular radar screen

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-phenomenon-lab-a.png`, `content/learning/source/en-phenomenon-lab-b.png`

---

### 44. [en-juxtaposition-market] - juxtaposition (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of a market with contrasting Steampunk and Cyberpunk stalls. Soft neon and gaslamp lighting. Key elements arranged across grid zones include: steampunk market wall gears in the upper left, floating cyberpunk neon signs in the upper right, market stalls side by side in the center, steampunk vendor in leather outfit, cyberpunk robot vendor, holographic tech displays, clockwork toys, market clocks, and stone drinking fountains. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the steampunk stall awning color from brown canvas to dark burgundy
2. Change the holographic technology display item from a small drone to a virtual spinning globe
3. Change the steampunk vendor's leather outfit color from brown to dark forest green
4. Change the hand-painted market sign color from yellow to bright red
5. Remove the large decorative brass gear from the steampunk stall wall
6. Add one glowing neon pink floating arrow sign above the cyberpunk stall
7. Change the featured market product from a mechanical clockwork bird to a clockwork toy soldier
8. Change the steampunk market clock style from Roman numeral face to a gear-driven pointer indicator
9. Change the cyberpunk robot vendor's eye glow color from red to bright blue
10. Remove the small stone drinking fountain from between the two market stalls

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-juxtaposition-market-a.png`, `content/learning/source/en-juxtaposition-market-b.png`

---

### 45. [en-kaleidoscope-chamber] - kaleidoscope (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of a kaleidoscope prism chamber. Violet light beams radiate from top center. Key elements arranged across grid zones include: stained glass panels on the upper left wall, wall mirrors on the upper right, a central glass prism splitting light rays into rainbows, ornate chamber doors, crystal ceiling ornaments, floor reflection patterns, and artists in white coats. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the largest stained glass panel color from deep blue to bright amber
2. Change the central prism shape from triangular to octagonal
3. Change the light ray color bouncing on the left wall from yellow to bright cyan
4. Remove one large wall mirror from the right side of the chamber
5. Add one large faceted crystal ornament hanging from the center of the ceiling
6. Change the chamber's ornate door color from dark bronze to bright gold
7. Change the floor reflection pattern from a starburst to concentric circles
8. Change the standing artist's coat color from white to deep purple
9. Change the main light beam entering from the top from amber to bright violet
10. Remove one hanging stained glass panel from the upper left section

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-kaleidoscope-chamber-a.png`, `content/learning/source/en-kaleidoscope-chamber-b.png`

---

### 46. [en-metamorphosis-cocoon] - metamorphosis (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a butterfly metamorphosis conservatory. Warm grow light glowing from top center. Key elements arranged across grid zones include: wall bracket mounts with chrysalis cocoons on the upper left, arched cathedral windows on the upper right, a central tropical garden with large fern leaves, newly emerged butterflies, biologist researchers in white coats, grow lights, magnifying glasses, and specimen jars. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the large chrysalis cocoon color from pale green to bright gold
2. Change the emerged butterfly wing color from orange to deep blue
3. Change the biologist researcher's outfit color from white to soft lavender
4. Change the large tropical plant leaves from dark green to bright lime green
5. Change the overhead grow light glow from white to warm amber
6. Remove the small green chrysalis from the far left wall bracket mount
7. Change the leaf pattern on the central fern from full oval to deeply serrated edges
8. Change the magnifying glass handle color from silver to deep red
9. Add one large glass specimen jar with lid to the observation table
10. Change the window frame style from rectangular to an arched cathedral style

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-metamorphosis-cocoon-a.png`, `content/learning/source/en-metamorphosis-cocoon-b.png`

---

### 47. [en-panoramic-observatory] - panoramic (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a mountain summit observatory at sunset. Warm golden sunset glow centered on the horizon. Key elements arranged across grid zones include: a soaring golden eagle in the upper left sky, wind anemometers on station masts in the upper right, a panoramic stone observation deck in the center, an observer in a blue windproof jacket, handheld telescopes, binoculars, wool caps, maps, and hiking backpacks. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the observer's windproof jacket color from bright blue to forest green
2. Change the handheld telescope body color from black to bright red
3. Remove the compact binoculars hanging around the observer's neck
4. Change the observation platform railing color from silver to warm gold
5. Change the wool cap color from gray to bright orange
6. Change the folded map cover color from green to bright yellow
7. Remove the golden eagle soaring in the far upper sky
8. Add one brass compass placed on the stone ledge beside the observer
9. Remove the spinning wind anemometer from the top of the station mast
10. Change the hiking backpack color from dark gray to bright cobalt blue

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-panoramic-observatory-a.png`, `content/learning/source/en-panoramic-observatory-b.png`

---

### 48. [en-cataclysm-volcano] - cataclysm (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a volcanic research station. Dramatic orange geothermal glow centered in the background crater. Key elements arranged across grid zones include: remote sensor units on the upper left wall mount, emergency sirens on the upper right entrance arch, a thermal drill probe and seismic monitoring screens in the center, researchers in hazmat suits, obsidian crystal racks, safety railings, rank badges, and lava containment canisters. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the hazmat helmet visor color from yellow-tinted to bright orange
2. Change the seismic monitoring screen display from a green waveform to a red alert pattern
3. Change the thermal drill probe color from gray steel to bright yellow
4. Remove the cluster of obsidian crystals from the left foreground specimen rack
5. Change the safety railing color from yellow to bright red
6. Change the researcher's shoulder rank badge color from blue to bright green
7. Remove one remote sensor unit from the station exterior wall mount
8. Change the mounted observation camera housing color from black to safety orange
9. Add one sealed lava containment sample canister to the right storage shelf
10. Remove the emergency siren beacon from the top of the entrance archway

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-cataclysm-volcano-a.png`, `content/learning/source/en-cataclysm-volcano-b.png`

---

### 49. [en-quintessence-alchemy] - quintessence (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of a celestial alchemy lab. Ethereal white crystal orb light centered above the altar. Key elements arranged across grid zones include: hanging moon pendants near candles on the upper left, celestial globes on stands on the upper right, an altar table in the center with a glowing crystal orb, an alchemist in ceremonial robes, brass astrolabes, ether crystal clusters, potion vials, and star map tables. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the ceremonial robe trim stripe color from gold to deep crimson red
2. Change the crystal orb glow color from white to deep purple
3. Change the brass astrolabe outer ring color from gold to verdigris green
4. Remove the pale blue ether crystal cluster from the center of the altar table
5. Change the celestial globe stand color from black iron to warm gold
6. Change the flask liquid from colorless to glowing amber
7. Remove the constellation star marker flag from the right side of the star map table
8. Change the tall pointed ceremonial hat band color from black to bright cobalt blue
9. Add one sealed crystal ether vial to the alchemist's reagent display shelf
10. Remove the hanging crescent moon pendant from the chain near the candle holder

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-quintessence-alchemy-a.png`, `content/learning/source/en-quintessence-alchemy-b.png`

---

### 50. [en-chrysanthemum-greenhouse] - chrysanthemum (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of a Victorian chrysanthemum greenhouse. Soft sunbeams shining from top center glass roof. Key elements arranged across grid zones include: hanging wicker flower baskets on upper left ceiling hooks, wall thermometers on upper right columns, a stone fountain petal basin in the center flanked by golden chrysanthemum flowerbeds, a florist in a work apron, watering cans, porcelain flowerpots, pruning shears, and potting benches. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the florist's work apron color from beige to bright coral red
2. Change the chrysanthemum bloom color from golden yellow to deep purple
3. Change the watering can color from dark green to bright teal
4. Remove the hanging wicker flower basket from the overhead iron ceiling hook
5. Change the decorative porcelain flower pot color from white to deep cobalt blue
6. Change the stone fountain petal basin color from gray to bright terracotta
7. Remove the pruning shears from the tool hook beside the work bench
8. Change the florist's hair ribbon color from pink to bright yellow
9. Add one small unglazed clay flowerpot to the right end of the potting bench
10. Remove the glass thermometer from its mounting bracket on the greenhouse column

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-chrysanthemum-greenhouse-a.png`, `content/learning/source/en-chrysanthemum-greenhouse-b.png`

---

### 51. [en-archipelago-island] - archipelago (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a tropical archipelago island view from a watchtower. Diffuse tropical daylight fills the sky without direct sun glare. Key elements arranged across grid zones include: sea hawk ospreys soaring in the upper left sky, a watchtower wooden canopy roof structure in the upper center, hanging oil lanterns on upper right tower posts, a watchtower deck in the center with a geographer in a linen shirt, brass telescopes, sun hats, canoe sails in the water, map containers, storage barrels, and island chains. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the geographer's linen shirt color from white to bright coral
2. Change the brass telescope tube color from gold to deep navy blue
3. Change the canoe sail color from white to bright orange
4. Remove the sea hawk osprey bird soaring in the sky above the islands
5. Change the watchtower observation railing color from dark wood to white painted
6. Change the wide-brim sun hat color from natural straw to bright red
7. Remove the wooden storage barrel from the corner of the platform
8. Change the cylindrical map container color from brown leather to olive green
9. Add one handheld brass compass placed on the railing beside the geographer
10. Remove the hanging oil lantern from the corner post of the watchtower

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-archipelago-island-a.png`, `content/learning/source/en-archipelago-island-b.png`

---

### 52. [en-constellation-astronomy] - constellation (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a night sky constellation observatory interior. Ethereal moonlight shines from top center dome opening. Key elements arranged across grid zones include: wall-mounted astrolabes on the upper left wall, star map cases on upper right shelves, a central celestial globe stand and telescope, a student in a wool sweater, star globes, oil lamps, and dome windows. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the student's wool sweater color from red to deep forest green
2. Change the telescope barrel tube color from silver to warm bronze
3. Change the celestial globe stand color from dark wood to bright gold
4. Remove the small oil lamp from the left corner of the observatory table
5. Change the star map carrying case color from brown leather to bright blue
6. Change the student's hair clip accessory color from silver to bright pink
7. Remove the brass astrolabe from its display hook on the wall
8. Change the window frame trim color from dark wood to bright white
9. Add one miniature rotating star globe ornament to the right side of the shelf
10. Remove the mercury thermometer from the wall mounting beside the dome window

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-constellation-astronomy-a.png`, `content/learning/source/en-constellation-astronomy-b.png`

---

### 53. [en-synchronicity-clock] - synchronicity (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a clock tower pendulum chamber. Warm ambient light shines from top center clock face. Key elements arranged across grid zones include: exposed gear sprockets on upper left walls, pressure gauges on upper right steam pipes, central twin pendulums in synchronicity, a clockmaker wearing a work vest, pocket watches, pressure valves, and jeweler loupes. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the clockmaker's work vest color from dark gray to deep navy blue
2. Change the large pendulum disc finish from polished brass to brushed copper
3. Change the clock numeral type from Roman numerals to Arabic numerals
4. Remove the small oil service lamp from the maintenance ledge
5. Change the pocket watch chain color from gold to bright silver
6. Change the pressure valve handle color from red to bright orange
7. Remove one large gear sprocket from the exposed mechanism on the wall
8. Change the jeweler's loupe magnifier band color from black to bright red
9. Add one small oil bottle to the clockmaker's workbench tool tray
10. Remove the pressure gauge dial from the steam pipe fitting on the wall

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-synchronicity-clock-a.png`, `content/learning/source/en-synchronicity-clock-b.png`

---

### 54. [en-camaraderie-campfire] - camaraderie (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of a forest campfire gathering at dusk. Warm campfire glow centered on the ground. Key elements arranged across grid zones include: solar lanterns hanging from tree branches on upper left, canvas tents on the upper right, a central campfire with campers roasting marshmallows, a guitarist in a sweater, acoustic guitar, cocoa mugs, neckerchiefs, and tactical flashlights. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the guitarist's wool sweater color from red to bright teal
2. Change the canvas tent color from olive green to bright orange
3. Change the hot cocoa mug color from white to deep navy blue
4. Remove the solar lantern hanging from the tree branch above the campfire
5. Change the neckerchief scarf color from blue to bright red
6. Change the marshmallow bag label color from white to bright yellow
7. Remove the wooden roasting stick from the hand of the seated camper
8. Change the acoustic guitar body color from dark natural wood to bright red
9. Add one enameled tin camping mug beside the log seat near the fire
10. Remove the tactical flashlight from the ground beside the tent entrance

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-camaraderie-campfire-a.png`, `content/learning/source/en-camaraderie-campfire-b.png`

---

### 55. [en-solitude-sanctuary] - solitude (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of an alpine mountain sanctuary. Soft sky lighting centered overhead. Key elements arranged across grid zones include: brass wind chimes hanging on upper left eaves, ink calligraphy wall scrolls on upper right alcoves, a meditating monk in saffron robes in the center, bronze meditation gongs, floor cushion mats, stone lanterns, lotus flowers, singing bowls, and tea cups. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the meditating monk's robe color from saffron orange to deep indigo
2. Change the large bronze meditation gong color from gold to aged verdigris green
3. Change the round floor cushion mat color from red to soft lavender
4. Remove the set of brass wind chimes hanging from the eave corner bracket
5. Change the stone lantern roof cap color from dark gray to warm terracotta
6. Change the lotus flower color from white to bright pink
7. Remove the singing bowl from beside the monk's meditation cushion
8. Change the wooden gong mallet handle color from brown to deep red
9. Add one small ceramic tea cup beside the incense holder on the altar table
10. Remove the hanging ink calligraphy wall scroll from the left side alcove

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-solitude-sanctuary-a.png`, `content/learning/source/en-solitude-sanctuary-b.png`

---

### 56. [en-serenity-lake] - serenity (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a tranquil lakeside scene at golden hour with a weathered wooden dock, a small rowboat tied at the pier, weeping willow trees trailing over calm water, lotus flowers floating on the surface, a fisherman in a wide hat, and misty mountains fading into the distance. Diffuse golden hour light illuminates the scene without direct sun glare. Key elements arranged across grid zones include weeping willow branches in the upper left, misty mountain peaks in the upper center, a flying heron in the upper right sky, a fisherman in a rowboat in the center, and a wooden dock with lotus flowers in the lower area. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the lily pad color from dark green to emerald green
2. Change the wooden boat oar from brown to light gray
3. Change the fishing lantern from white to gold
4. Remove one floating lotus flower from the lake surface
5. Change the fisherman's vest from beige to teal blue
6. Change the willow branch curtain color from yellow-green to deep green
7. Remove one koi fish visible near the dock
8. Change the dock plank wood color from pale to warm brown
9. Add one white egret bird standing in the shallow water
10. Remove one reed clump from the left bank

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-serenity-lake-a.png`, `content/learning/source/en-serenity-lake-b.png`

---

### 57. [en-tranquility-tea] - tranquility (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a serene Japanese tea ceremony room with a low wooden table set for tea, an iron tetsubin kettle, a clay teapot, a bamboo whisk and scoop, tatami floor mats, a sand garden visible through a shoji paper screen window, an incense holder on the sill, and a flower arrangement on a lacquered shelf. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the tea tray mat from cream to emerald green
2. Change the ceramic teapot body color from white to pale lavender
3. Change the teacup handle from light clay to dark brown
4. Remove one bamboo whisk from the tea preparation area
5. Change the tatami room sliding panel from beige to soft gray
6. Change the iron kettle handle from rust red to matte black
7. Remove one incense stick from the holder beside the window
8. Change the flower arrangement vase from celadon to cobalt blue
9. Add one small wooden tea scoop on the tea tray
10. Remove one decorative pebble from the sand garden border

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-tranquility-tea-a.png`, `content/learning/source/en-tranquility-tea-b.png`

---

### 58. [en-creativity-workshop] - creativity (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a vibrant artist's studio workshop where a painter works at a large canvas on an easel, surrounded by paint jars arranged on shelves, brushes standing in a blue jar, a rotating color wheel display unit, sketch pads pinned to a pegboard wall, a rollable studio stool, and a neon spotlight overhead. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the artist's beret from navy to ruby red
2. Change the large canvas background wash from blue to emerald green
3. Change the paint palette shape from oval to rectangular
4. Remove one paint jar from the crowded supply shelf
5. Change the wooden easel legs from light pine to dark walnut brown
6. Change the artist's apron from beige to matte black
7. Remove one rolled-up canvas from the floor corner
8. Change the studio window frame from white to warm brown
9. Add one magnifying glass on the desk beside the sketchbook
10. Remove one spotlight from the ceiling track

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-creativity-workshop-a.png`, `content/learning/source/en-creativity-workshop-b.png`

---

### 59. [en-illumination-library] - illumination (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of a warm cozy library interior with towering dark wood bookshelves packed with colorful books, a glowing amber reading lamp on a study desk, a plush leather armchair, an open book on the desk surface, a wooden globe on a stand, a wooden card catalog cabinet, and a rolled wall map hanging beside the reference window. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the librarian's cardigan color from gray to deep purple
2. Change the reading lamp shade from amber to ivory white
3. Change the bookshelf accent light strip to emerald green
4. Remove one stack of books from the side reading table
5. Change the armchair upholstery from burgundy to forest green
6. Change the wooden card catalog drawer handles from brass to dark brown
7. Remove one wall map from the reference section
8. Change the globe stand from silver to gold tone
9. Add one small potted succulent on the corner windowsill
10. Remove one bookmark ribbon hanging from a book spine

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-illumination-library-a.png`, `content/learning/source/en-illumination-library-b.png`

---

### 60. [en-resonance-concert] - resonance (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of a lively rock concert stage with a full live band — lead vocalist at front mic, drummer at center back, guitarist on left, bassist on right, and keyboard player at the side — colorful stage lighting rigs overhead, large speaker stacks on each side of the stage, and a small excited crowd visible in the foreground. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the lead vocalist's stage jacket from crimson to electric purple
2. Change the drum cymbal stand from silver to warm gold
3. Change the guitar body finish from sunburst to emerald green
4. Remove one speaker monitor from the front stage edge
5. Change the bass guitar neck from maple to dark rosewood
6. Change the microphone stand arm from black to warm gold
7. Remove one hanging stage light rig from the far left
8. Change the keyboard instrument casing from white to navy
9. Add one small electric fan oscillating on the side monitor
10. Remove one music stand from behind the drummer

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-resonance-concert-a.png`, `content/learning/source/en-resonance-concert-b.png`

---

### 61. [en-harmony-orchestra] - harmony (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a grand concert hall orchestra performance with a conductor at a carved wooden podium, rows of string players with violins and cellos, a brass and wind section seated behind them, ornate balcony seating above, a chandelier overhead, and warm dramatic spotlights illuminating the performers on stage. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the conductor's tailcoat from black to emerald green
2. Change the cello body finish from warm amber to deep cherry red
3. Change the decorative ribbon on music stand from ruby red to gold
4. Remove one empty music stand from the back row of the orchestra
5. Change the hall balcony railing color to marble white
6. Change the violin chinrest from ebony black to rosewood brown
7. Remove one pendant ceiling light from the concert hall
8. Change the stage floor planks from light oak to dark mahogany
9. Add one small flower bouquet at the foot of the conductor's podium
10. Remove one timpani mallet from beside the percussion section

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-harmony-orchestra-a.png`, `content/learning/source/en-harmony-orchestra-b.png`

---

### 62. [en-eternity-monument] - eternity (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a grand public plaza featuring a tall stone obelisk monument with a golden eternal flame at the top, marble pathways radiating outward from the base, decorative clay urns at each corner, an ornate iron fence surrounding the plaza, stone benches for visitors, and a formal flower garden encircling the monument. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the monument's accent stone from gray to ruby red
2. Change the eternal flame pedestal from silver to gold
3. Change the stone bench near the monument from dark gray to warm brown
4. Remove one wreath placed at the monument base
5. Change the surrounding marble pathway border to bright white
6. Change the iron fence post color from black to dark brown
7. Remove one flag pole from the plaza surrounding area
8. Change the decorative urn color from terracotta to emerald green
9. Add one small dedication plaque beside the main monument slab
10. Remove one stone lantern from the garden pathway edge

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-eternity-monument-a.png`, `content/learning/source/en-eternity-monument-b.png`

---

### 63. [en-tranquility-garden] - tranquility (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a serene zen garden at night with glowing stone lanterns lining a path, a neon-lit koi pond as the centerpiece, a bamboo wind chime hanging from a pergola, purple wisteria blossoms overhead, mossy stepping stones, a wooden moon bridge arching over the pond, and an iron garden bench on the far side. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the stone garden lantern cap from dark granite to mossy gray
2. Change the reflecting pool water glow accent to cyan
3. Change the wisteria arbor trellis from navy to emerald green
4. Remove one stepping stone from the garden pathway
5. Change the bamboo wind chime color from pale tan to deep green
6. Change the iron bench seat from rust brown to matte black
7. Remove one koi fish from the tranquility pond
8. Change the wooden bridge railing from light brown to warm gold
9. Add one small tortoise figurine beside the stone path
10. Remove one hanging paper lantern from the pergola

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-tranquility-garden-a.png`, `content/learning/source/en-tranquility-garden-b.png`

---

### 64. [en-creativity-studio] - creativity (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of a vibrant miniature artist studio with a canvas on an easel, paint jars organized by color on a wall pegboard, a wooden artist mannequin, scattered sketch papers on the central worktable, a spinning color wheel display unit, a corner desk lamp, and mini tubes of paint lined up on a side trolley shelf. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the painter's canvas frame from white to deep indigo
2. Change the hanging light bulb filament from warm white to gold
3. Change the display shelf material from matte black to silver white
4. Remove one paintbrush from the jar on the main worktable
5. Change the rotating color wheel accent from cyan to ruby red
6. Change the wooden stool legs from light pine to dark walnut brown
7. Remove one paint palette from the side trolley shelf
8. Change the pegboard background from white to light cream
9. Add one small sketch mannequin on the corner desk
10. Remove one desk lamp from the corner table

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-creativity-studio-a.png`, `content/learning/source/en-creativity-studio-b.png`

---

### 65. [en-resonance-stage] - resonance (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of an intimate acoustic concert stage with a solo vocalist at a standing microphone, an acoustic guitarist seated on the left, a double bassist on the right, a minimalist drum kit at the back, a grand piano visible on the far right of the stage, floor monitor wedges, and warm amber spotlights casting long shadows. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the stage backdrop curtain from deep red to emerald green
2. Change the vocalist's outfit jacket from black to bright cobalt blue
3. Change the acoustic guitar body from sunburst yellow to cherry red
4. Remove one hanging overhead stage light from the right truss
5. Change the bass amplifier grille cloth from black to dark olive
6. Change the drum kit main shell color from black to white pearl
7. Remove one floor monitor wedge from the stage front
8. Change the microphone capsule head from silver to warm gold
9. Add one tuning fork placed on top of the piano lid
10. Remove one guitar cable coil from behind the drum riser

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-resonance-stage-a.png`, `content/learning/source/en-resonance-stage-b.png`

---

### 66. [en-serenity-haven] - serenity (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a cozy outdoor patio retreat with a woven hammock strung between two trees, a teak wooden deck chair with a cushion, a garden parasol, a planter box of blooming flowers, festoon string lights draped overhead, a glass side table with lemonade, and a wicker footstool resting on the wooden deck. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the hammock fabric from cream to light sage green
2. Change the wooden deck chair from teak to painted white
3. Change the hanging wind chime from silver to bronze
4. Remove one throw pillow from the outdoor sofa
5. Change the planter box trim from terracotta to slate blue
6. Change the parasol canopy stripe pattern from diagonal to horizontal
7. Remove one potted succulent from the side table
8. Change the footstool wicker material from natural to dark brown
9. Add one folded linen blanket draped over the hammock edge
10. Remove one string light bulb from the overhead festoon lights

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-serenity-haven-a.png`, `content/learning/source/en-serenity-haven-b.png`

---

### 67. [en-solitude-cliff] - solitude (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a dramatic clay coastline cliff overlook where a lone artist paints at a portable easel, with a stone bench nearby, binoculars resting on a ledge, a hiking backpack on the ground, wildflowers growing at the cliff edge, seagulls soaring in the air, and a wooden trail signpost at a path fork behind the artist. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the cliff-top bench color from gray stone to sandy beige
2. Change the artist's sketchbook cover from warm brown to olive green
3. Change the hiking jacket from olive to navy blue
4. Remove one seagull from the cliffside sky
5. Change the wooden easel color from pale pine to dark cedar
6. Change the binoculars strap from black to warm gold
7. Remove one wild flower clump from the cliff edge foreground
8. Change the backpack fabric from gray canvas to deep burgundy
9. Add one small compass resting on the stone ledge
10. Remove one wooden signpost from the cliff trail fork

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-solitude-cliff-a.png`, `content/learning/source/en-solitude-cliff-b.png`

---

### 68. [en-3d-serenity] - serenity (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a mystical floating island sanctuary with a glowing crystal tower at the center, a serene circular reflection pool, ancient stone arches hung with scrolls, firefly light orbs drifting through mist, cascading waterfalls off the island edges, a monk meditating on a carved stone platform, and lotus blossoms floating on the pool surface. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the 3D crystal tower glow from teal to deep sapphire blue
2. Change the floating stone platform trim color to marble white
3. Change the tree trunk bark from gray to warm brown
4. Remove one 3D firefly light orb from the mid-ground mist
5. Change the waterfall cascade glow tint from white to cyan
6. Change the monk's robe sash from navy to ruby red
7. Remove one stone lantern from the left side of the sanctuary path
8. Change the archway decoration from circular to pointed arch shape
9. Add one 3D lotus blossom floating on the reflection pool
10. Remove one hanging scroll from the temple inner wall

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-3d-serenity-a.png`, `content/learning/source/en-3d-serenity-b.png`

---

### 69. [en-3d-creativity] - creativity (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of an engineer creation studio. Soft holographic light centered overhead. Key elements arranged across grid zones include: 3D printers on upper left side shelves, color chip swatches on upper right pegboards, central engineer at a workbench with a 3D robot companion model, floating hologram blueprints, touch pens, calipers, desk lamps, and chairs. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change 3D artist's suspender straps from denim blue to ruby red
2. Change 3D robot chest core glow from cool blue to warm golden amber
3. Change 3D printer body on side shelf from matte black to silver white
4. Remove one 3D mug from the wooden workbench
5. Change floating hologram blueprint glow from cyan to magenta purple
6. Change 3D touch pen in engineer's hand from brown to bright yellow
7. Remove one color chip swatch from the right pegboard wall
8. Change chair cushion seat from navy to emerald green
9. Add one small 3D digital caliper on the edge of the workbench
10. Remove one desk lamp from the corner table

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-3d-creativity-a.png`, `content/learning/source/en-3d-creativity-b.png`

---

### 70. [en-3d-harmony] - harmony (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of a botanical greenhouse stage. Soft sunbeams from top center glass roof. Key elements arranged across grid zones include: paper lanterns on upper left pillars, flower vases on upper right stage corners, a central violinist playing violin surrounded by floating chord waves, botanical stone arches, music stands, and harps. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change 3D violinist dress from emerald silk to deep sapphire blue
2. Change 3D violin body from gold to dark mahogany wood
3. Change floating chord wave ribbon colors to ruby red and gold
4. Remove one small 3D music stand on the left stage floor
5. Change botanical arch stone trim color to marble white
6. Change violin chinrest part color to rosewood brown
7. Remove one flower vase from the stage corner
8. Change violinist's hair ribbon tie color to white satin
9. Add one mini 3D brass harp model next to podium shelf
10. Remove one paper lantern hanging on the botanical arch pillar

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-3d-harmony-a.png`, `content/learning/source/en-3d-harmony-b.png`

---

### 71. [en-clay-bakery] - creativity (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a charming French-style bakery interior with a baker in a white apron standing behind a glass display case filled with pastries and layered cakes, croissants arranged on a front tray, a copper pot hanging from a ceiling rack, a handwritten chalkboard menu on the wall, bread baskets on wooden shelves, and flour sacks stored on the lower shelf below the counter. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the baker's apron from white to dusty rose
2. Change the oven door knob from black to bright chrome silver
3. Change the frosted cake tier from pink to lavender
4. Remove one croissant from the front display tray
5. Change the chalkboard menu sign frame from black to emerald green
6. Change the bread basket weave color from natural straw to dark wicker
7. Remove one hanging copper pot from the ceiling rack
8. Change the cupcake liner color from plain white to polka-dot red
9. Add one small sugar sifter on the corner prep counter
10. Remove one flour sack from the lower storage shelf

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-clay-bakery-a.png`, `content/learning/source/en-clay-bakery-b.png`

---

### 72. [en-papercut-forest] - serenity (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a layered paper-cut craft diorama depicting an enchanted forest — multiple silhouette layers of paper trees in dark tones, a standing deer figure in the mid-layer, paper mushrooms on the ground layer, a glowing moon disc in the sky layer, bird shapes flying in the upper canopy, and a butterfly in the center mid-layer. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the largest paper-cut tree trunk layer from dark brown to rust orange
2. Change the sky gradient paper layer color from pale blue to soft peach
3. Change the deer silhouette paper layer from dark brown to deep teal
4. Remove one paper mushroom from the forest floor layer
5. Change the accent flower cut-out color from pink to ruby red
6. Change the grass ground layer from light green to emerald green
7. Remove one paper butterfly from the canopy right section
8. Change the moon paper disc from warm yellow to silver white
9. Add one small paper owl silhouette on a tree branch layer
10. Remove one layered paper bird from the flock in the sky layer

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-papercut-forest-a.png`, `content/learning/source/en-papercut-forest-b.png`

---

### 73. [en-cyberpunk-space] - illumination (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a cyberpunk deep space command station with a massive observation window overlooking a colorful star nebula, a spacecraft visible docking below, AI crew members in glowing neon-lit pressure suits at holographic control panels, exterior satellite dish arrays, and a glowing navigation space buoy floating outside the main viewport. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the 3D spaceship hull accent glow from cyan to ruby red
2. Change the rocket thruster flame from blue to warm golden amber
3. Change the space station solar panel tint from silver to emerald green
4. Remove one floating asteroid debris from the upper left quadrant
5. Change the nebula cloud glow from cyan to violet purple
6. Change the AI crew member's visor tint from clear to magenta purple
7. Remove one satellite dish from the space station exterior
8. Change the LED status light panel color from green to red
9. Add one small comet trail streaking across the top right sky
10. Remove one space buoy beacon from the mid-distance starfield

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-cyberpunk-space-a.png`, `content/learning/source/en-cyberpunk-space-b.png`

---

### 74. [en-clay-zoo] - camaraderie (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of a cheerful miniature zoo scene with visible enclosures containing a tall giraffe, a large elephant, bright pink flamingos, and a big cat — a zookeeper in a warm vest holding a feeding bucket, informational signs posted at each animal enclosure, a raised wooden viewing platform walkway, and a visitor map board standing at the main pathway junction. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the zookeeper's vest from warm brown to ruby red
2. Change the giraffe's patch spot markings from amber to terracotta
3. Change the enclosure fence from chain-link gray to painted teal
4. Remove one bucket from the elephant feeding area
5. Change the foliage behind the big cat pen from brown-green to emerald green
6. Change the flamingo feather color from pale pink to coral orange
7. Remove one informational sign from a habitat enclosure
8. Change the wooden viewing platform edge railing from light wood to dark brown
9. Add one small tortoise near the reptile habitat border
10. Remove one visitor map board from the pathway junction

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-clay-zoo-a.png`, `content/learning/source/en-clay-zoo-b.png`

---

### 75. [en-papercut-sakura] - tranquility (ENGLISH)
- **Recommended Art Style:** `Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion`

#### 📌 Image A Prompt (Base)
```text
A Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion of a Japanese-themed paper-cut craft diorama with multiple layered paper silhouettes — blooming sakura cherry blossom trees, a red arched bridge over a flowing river layer, paper crane birds in the sky, a round moon disc, layered mountain silhouettes in the distant background, and a small paper boat sailing on the water layer. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Modern low-poly 3D render, vibrant pastel color palette, clean geometric aesthetics, sharp ambient occlusion, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the outermost sakura petal paper layer from soft pink to pale peach
2. Change the lantern paper-cut accent from gold to cyan
3. Change the bridge arch layer color from red lacquer to dark plum
4. Remove one paper crane from the upper sky section
5. Change the background mountain silhouette layer to marble white
6. Change the cherry blossom branch accent paper from blush pink to ruby red
7. Remove one paper boat from the river layer
8. Change the moon disc paper layer from cream to silver-gray
9. Add one small paper fox silhouette among the tree trunks
10. Remove one layered paper wave from the water foreground

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-papercut-sakura-a.png`, `content/learning/source/en-papercut-sakura-b.png`

---

### 76. [en-cyberpunk-neon] - resonance (ENGLISH)
- **Recommended Art Style:** `High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures`

#### 📌 Image A Prompt (Base)
```text
A High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures of a cyberpunk underground club where a DJ performs behind twin turntables on a raised neon-lit booth, with massive LED wall panels pulsing with color behind, a vinyl record crate stacked beside the booth, multiple glowing neon signs hanging from the ceiling, tall speaker stacks on each side, and a glowing crowd of dancers visible on the floor below. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same High-end 3D Pixar style digital render, vibrant studio lighting, volumetric depth, rich textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the 3D DJ's headset cup color from cyan to ruby red
2. Change the turntable platter accent ring from silver to warm golden amber
3. Change the neon underline glow beneath the decks from cyan to emerald green
4. Remove one stacked vinyl record from the crate beside the DJ booth
5. Change the mixing board channel fader knob from black to cobalt blue
6. Change the LED wall panel color array to magenta purple
7. Remove one hanging neon sign from the back wall of the club
8. Change the speaker grille LED accent strip color from white to red
9. Add one small neon arrow pointing down above the DJ booth
10. Remove one wristband from the DJ's left arm

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-cyberpunk-neon-a.png`, `content/learning/source/en-cyberpunk-neon-b.png`

---

### 77. [en-clay-family] - camaraderie (ENGLISH)
- **Recommended Art Style:** `Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows`

#### 📌 Image A Prompt (Base)
```text
A Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows of a warm clay family picnic scene in a sunny garden — a dad, mom, and young child sitting together on a patterned picnic blanket spread with food and snacks, a wicker fruit basket, a glass lemonade pitcher, colorful balloons tied to the blanket corner, a vibrant flower garden behind them, and a painted white garden gate at the back. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Charming 3D Claymation style render, plasticine texture, soft lighting, handcrafted clay visual, soft shadows, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the family picnic blanket color from warm brown to emerald green
2. Change the dad's shirt color from light blue to ruby red
3. Change the mom's hair ribbon from yellow to lavender
4. Remove one apple from the fruit basket on the blanket
5. Change the lemonade pitcher from clear glass to warm gold tint
6. Change the child's balloon from red to sky blue
7. Remove one cupcake from the dessert tray
8. Change the garden gate behind the family from white to pale gray
9. Add one small butterfly landing on the flower bush edge
10. Remove one sunflower from the garden bed in the background

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-clay-family-a.png`, `content/learning/source/en-clay-family-b.png`

---

### 78. [en-papercut-lighthouse] - epiphany (ENGLISH)
- **Recommended Art Style:** `Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting`

#### 📌 Image A Prompt (Base)
```text
A Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting of a paper-cut craft diorama depicting a coastal lighthouse scene — layered paper wave silhouettes in the foreground, a striped lighthouse tower rising from a cliff layer, seagull cutouts soaring in the sky, a paper sailing ship on the ocean middle layer, a rocky harbor dock at the base, and a decorative life ring mounted on the lighthouse wall. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Futuristic 3D Sci-Fi render, glowing neon accents, polished metallic surfaces, cinematic lighting, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the lighthouse beam color from white to warm amber
2. Change the paper-cut wave crests from gold to cyan
3. Change the paper lighthouse stripe from red to deep navy blue
4. Remove one seagull silhouette from the sky layer
5. Change the light room glass accent from clear to ruby red tint
6. Change the cliff rock layer color from gray to dusty rose
7. Remove one paper ship from the ocean foreground layer
8. Change the dock plank layer color from pale wood to dark brown
9. Add one small paper anchor icon near the harbor base layer
10. Remove one paper life ring from the lighthouse wall element

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-papercut-lighthouse-a.png`, `content/learning/source/en-papercut-lighthouse-b.png`

---

### 79. [en-cyberpunk-city] - juxtaposition (ENGLISH)
- **Recommended Art Style:** `Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures`

#### 📌 Image A Prompt (Base)
```text
A Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures of a miniature cyberpunk city alleyway at night — neon-lit skyscrapers with glowing rooftop signs, a flying taxi vehicle hovering above, bright neon shopfront signs at street level, a street vendor stall in the alley, rain puddles reflecting the neon glow, an overhead billboard display, delivery drones in the air, LED street lamps lining the curb, and a metal trash can beside the sidewalk. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.
```

#### 📌 Image B Prompt (Input after Image A reference - 100% High-Quality English)
```text
Maintain the exact same Detailed 3D Miniature toy render, tilt-shift macro lens feel, wooden and glossy plastic textures, camera angle, characters, and overall background of the provided Image A.

Create Image B for a spot-the-difference game by ONLY making the following 10 precise micro-changes:
1. Change the 3D miniature skyscraper rooftop glow from teal to emerald green
2. Change the flying taxi vehicle body from cyan to warm golden amber
3. Change the neon shopfront sign color from white to ruby red
4. Remove one street vendor stall from the cyberpunk alley foreground
5. Change the rain puddle reflection glow from blue to purple
6. Change the overhead billboard display panel color to magenta purple
7. Remove one drone from the mid-air delivery route
8. Change the LED street lamp color from white to cyan
9. Add one small neon cat sculpture on top of a corner building
10. Remove one trash can from the curbside of the alley

Do NOT alter background ground textures, dirt grain, small pebble positions, or shadows. Only modify the exact 10 specified objects. Do NOT make a split screen or side-by-side view. Output a single 1:1 full-bleed Image B.
```

- **File Names:** `content/learning/source/en-cyberpunk-city-a.png`, `content/learning/source/en-cyberpunk-city-b.png`

---
