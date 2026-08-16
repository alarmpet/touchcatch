/**
 * Synthesises the game's feedback sounds from scratch.
 *
 * Nothing is downloaded and no sample library is used, so every byte in
 * `apps/mobile/assets/audio/` is our own work and carries no third-party licence. That is
 * the cheap answer to the rights question, but it is not the only reason: the design calls
 * for a pitch that climbs one step per consecutive find, and a stock "ding" cannot do that.
 * Generating the scale means the interval is exact.
 *
 * Why pentatonic: the player controls the order and speed of the notes, so any two that
 * land close together must not clash. A major pentatonic scale has no semitone and no
 * tritone, which means *every* combination is consonant — the reason marimba-style mobile
 * games reach for it. A diatonic scale would sour the moment someone found two differences
 * quickly.
 *
 * Run: node tools/audio/generate-feedback-sounds.mjs [--check]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputDir = resolve(root, 'apps/mobile/assets/audio');

const SAMPLE_RATE = 44_100;

/** C major pentatonic from C5. Eight steps is more than the widest board needs. */
const FIND_SCALE_HZ = [
  523.251, // C5
  587.330, // D5
  659.255, // E5
  783.991, // G5
  880.000, // A5
  1046.502, // C6
  1174.659, // D6
  1318.510, // E6
];

/** The resolved chord: C5 E5 G5 C6. */
const COMPLETE_CHORD_HZ = [523.251, 659.255, 783.991, 1046.502];

/** A low, soft A3. Deliberately dull — a miss is "not here", not a punishment. */
const MISS_HZ = 220.0;

function envelope(index, total, attackSeconds, decaySeconds) {
  const t = index / SAMPLE_RATE;
  const attack = attackSeconds > 0 ? Math.min(1, t / attackSeconds) : 1;
  // Exponential decay is what makes a struck-bar sound rather than an organ note.
  const decay = Math.exp(-t / decaySeconds);
  // A short fade at the very end guarantees the buffer reaches exact silence, so looping
  // or fast retriggering cannot produce a click.
  const tail = Math.min(1, (total - index) / (SAMPLE_RATE * 0.006));
  return attack * decay * tail;
}

/**
 * One struck note: fundamental plus a quiet two-octave partial.
 *
 * Real bars ring an octave-and-a-fifth up rather than a pure octave, but the fourth
 * harmonic is what reads as "wood" to the ear at this length and costs nothing.
 */
function strike(frequencies, seconds, gain, decaySeconds) {
  const total = Math.round(SAMPLE_RATE * seconds);
  const samples = new Float64Array(total);
  for (let index = 0; index < total; index += 1) {
    const t = index / SAMPLE_RATE;
    let value = 0;
    for (const frequency of frequencies) {
      value += Math.sin(2 * Math.PI * frequency * t);
      value += 0.18 * Math.sin(2 * Math.PI * frequency * 4 * t);
    }
    samples[index] = (value / frequencies.length) * envelope(index, total, 0.002, decaySeconds) * gain;
  }
  return samples;
}

function encodeWav(samples) {
  const header = Buffer.alloc(44);
  const body = Buffer.alloc(samples.length * 2);
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  // Normalise to a consistent headroom so no cue is jarringly louder than another.
  const scale = peak > 0 ? (0.89 * 32_767) / peak : 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-32_768, Math.min(32_767, Math.round(samples[index] * scale)));
    body.writeInt16LE(value, index * 2);
  }
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + body.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(body.length, 40);
  return Buffer.concat([header, body]);
}

export function buildFeedbackSounds() {
  const files = new Map();
  FIND_SCALE_HZ.forEach((frequency, step) => {
    // Short enough that a fast tapper hears distinct notes rather than a smear.
    files.set(`find-${step + 1}.wav`, encodeWav(strike([frequency], 0.30, 0.85, 0.10)));
  });
  files.set('miss.wav', encodeWav(strike([MISS_HZ], 0.13, 0.45, 0.035)));
  // Longer decay so the last find feels like the scene settling, not another tick.
  files.set('complete.wav', encodeWav(strike(COMPLETE_CHORD_HZ, 1.10, 0.80, 0.42)));
  return files;
}

export const FEEDBACK_SOUND_NAMES = [
  ...FIND_SCALE_HZ.map((_unused, step) => `find-${step + 1}.wav`),
  'miss.wav',
  'complete.wav',
];

function main() {
  const check = process.argv.includes('--check');
  const files = buildFeedbackSounds();
  if (!check) mkdirSync(outputDir, { recursive: true });
  const drift = [];
  for (const [name, bytes] of files) {
    const path = resolve(outputDir, name);
    if (check) {
      if (!existsSync(path) || !readFileSync(path).equals(bytes)) drift.push(name);
      continue;
    }
    writeFileSync(path, bytes);
  }
  if (check) {
    if (drift.length > 0) {
      process.stderr.write(`feedback audio drift: ${drift.join(', ')}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`feedback audio matches the generator (${files.size} files)\n`);
    return;
  }
  const manifest = [...files].map(([name, bytes]) => ({
    file: name,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }));
  process.stdout.write(`${JSON.stringify({ sampleRate: SAMPLE_RATE, files: manifest }, null, 2)}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
