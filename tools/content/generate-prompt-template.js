/**
 * TouchCatch Signature Prompt Template Generator
 * Standardized based on global top spot-the-difference game benchmarks.
 */

export const SIGNATURE_STYLES = {
  CLAY_DIORAMA: {
    name: 'Handcrafted Clay Diorama',
    benchmark: 'Hidden Lands / Tiny Tales 3D',
    styleToken: 'Handcrafted 3D Claymation, plasticine texture, soft miniature lighting, tilt-shift lens feel, cozy warm shadows',
    recommendedCategories: ['FOOD', 'BAKERY', 'ANIMALS', 'KIDS']
  },
  PIXAR_3D: {
    name: 'High-End 3D Pixar Render',
    benchmark: 'Differences 3D',
    styleToken: 'High-end 3D Pixar animation render, rich volumetric studio lighting, vibrant depth, glossy textures',
    recommendedCategories: ['PROFESSION', 'CITY', 'SCIENCE', 'ENGLISH']
  },
  CYBERPUNK_NEON: {
    name: 'Cyberpunk Sci-Fi Hologram',
    benchmark: 'Spectator / Para Eyes',
    styleToken: 'Futuristic 3D Sci-Fi render, glowing cyan-purple neon accents, metallic surfaces, cinematic contrast',
    recommendedCategories: ['SPACE', 'ROBOTICS', 'FUTURE_TECH']
  },
  ORIENTAL_WATERCOLOR: {
    name: 'Cozy Oriental Watercolor',
    benchmark: 'Broken Lens',
    styleToken: 'Traditional Korean watercolor ink wash, soft brush strokes, elegant gradient textures, paper grain',
    recommendedCategories: ['KOREAN_PROVERB', 'IDIOM', 'CLASSICS']
  },
  LAYERED_PAPERCUT: {
    name: 'Layered Papercut Craft',
    benchmark: 'Paper Puzzles',
    styleToken: 'Layered papercut craft art, visible paper grain, shadow depth, clean die-cut edges, pastel color palette',
    recommendedCategories: ['NATURE', 'ECOSYSTEM', 'SCENERY']
  }
};

/**
 * Builds a prompt pair (Image A and Image B) applying 9-grid balance and signature style tokens.
 */
export function buildBenchmarkPromptPair(styleKey, sceneDescription, changesList) {
  const style = SIGNATURE_STYLES[styleKey] || SIGNATURE_STYLES.PIXAR_3D;
  
  const promptA = `${style.styleToken} of ${sceneDescription}. 100% full-bleed environment with no borders or margins, no text, no split screens, edge-to-edge 1:1 aspect ratio composition.`;
  
  const formattedChanges = changesList.map((change, idx) => `${idx + 1}. ${change}`).join(' ');
  const promptB = `Maintain the EXACT background structure, lighting, and camera angle of Image A. Create Image B for a spot-the-difference game with ONLY these 10 distinct, medium-large, highly-contrasted local changes: ${formattedChanges}. Make all 10 changes prominent, sharp, and local. Single 1:1 image.`;
  
  return { promptA, promptB, styleInfo: style };
}
