import fs from 'node:fs';

const derivedData = JSON.parse(fs.readFileSync('content/learning/derived-hitboxes.v1.json', 'utf8')).packs;

export function checkPackHunts(packKey, hunts) {
  const derived = derivedData[packKey];
  if (!derived || !derived.usable) {
    return { ok: false, error: `Pack ${packKey} not usable or not found` };
  }
  const errors = [];
  const MIN_R = 0.062;

  if (!Array.isArray(hunts) || hunts.length !== 3) {
    errors.push(`Must have exactly 3 hunts, got ${hunts?.length}`);
  }

  hunts.forEach((h, idx) => {
    const expectedKind = idx === 2 ? 'SPECIAL' : 'NORMAL';
    if (h.kind !== expectedKind) errors.push(`Hunt ${idx+1} kind is ${h.kind}, expected ${expectedKind}`);
    if (h.r < MIN_R) errors.push(`Hunt ${idx+1} r=${h.r} < ${MIN_R}`);
    if (h.cx - h.r < 0 || h.cx + h.r > 1) errors.push(`Hunt ${idx+1} cx=${h.cx} r=${h.r} out of bounds X`);
    if (h.cy - h.r < 0 || h.cy + h.r > 1) errors.push(`Hunt ${idx+1} cy=${h.cy} r=${h.r} out of bounds Y`);

    // Check intersection with differences
    for (const diff of derived.differences) {
      const dist = Math.hypot(h.cx - diff.cx, h.cy - diff.cy);
      if (dist < h.r + diff.r) {
        errors.push(`Hunt ${idx+1} (${h.missionId}: ${h.publicPrompt}) overlaps difference ${diff.id} (dist ${dist.toFixed(3)} < ${ (h.r + diff.r).toFixed(3) })`);
      }
    }
  });

  // Check mutual hunt overlap
  for (let i = 0; i < hunts.length; i++) {
    for (let j = i + 1; j < hunts.length; j++) {
      const dist = Math.hypot(hunts[i].cx - hunts[j].cx, hunts[i].cy - hunts[j].cy);
      if (dist <= hunts[i].r + hunts[j].r) {
        errors.push(`Hunts ${i+1} and ${j+1} overlap (dist ${dist.toFixed(3)} <= ${(hunts[i].r + hunts[j].r).toFixed(3)})`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

if (process.argv[1]?.endsWith('inspect-pack-hunts.mjs')) {
  console.log('Helper loaded.');
}
