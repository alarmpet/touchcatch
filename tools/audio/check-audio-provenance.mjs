/**
 * Fails the build on any shipped audio file that nobody can account for.
 *
 * The synthesiser's own `--check` proves the ten generated files came from the generator.
 * It says nothing about an eleventh file appearing next to them, which is exactly how an
 * unlicensed track gets into a release: somebody drops an mp3 in the assets folder and no
 * gate notices. This closes that.
 *
 * Two rules:
 *   1. Every audio file under the assets directory is either a declared synthesised file or
 *      a declared licensed one. Anything else is a hard failure.
 *   2. Every licensed entry names a licence we have agreed to accept, records where the file
 *      came from, and — when the licence demands credit — carries the exact line to show.
 *
 * Run: node tools/audio/check-audio-provenance.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidencePath = resolve(root, 'config/audio-rights-evidence.v1.json');
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.m4a', '.aac', '.flac', '.caf', '.opus']);

function listAudioFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return listAudioFiles(path);
    const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
    return AUDIO_EXTENSIONS.has(extension) ? [path] : [];
  });
}

export function checkAudioProvenance() {
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  const synthesisedDir = resolve(root, evidence.directories.synthesised);
  const licensedDir = resolve(root, evidence.directories.licensed);
  const accepted = new Map(evidence.acceptedLicences.map((entry) => [entry.id, entry]));
  const failures = [];

  const declaredSynthesised = new Set(evidence.synthesised.flatMap((entry) => entry.files));
  const declaredLicensed = new Map(evidence.licensed.map((entry) => [entry.file, entry]));

  for (const path of listAudioFiles(synthesisedDir)) {
    const isLicensed = path.startsWith(`${licensedDir}\\`) || path.startsWith(`${licensedDir}/`);
    const name = isLicensed ? relative(licensedDir, path).split('\\').join('/') : relative(synthesisedDir, path);
    const declared = isLicensed ? declaredLicensed.has(name) : declaredSynthesised.has(name);
    if (!declared) {
      failures.push(`undeclared audio file: ${relative(root, path).split('\\').join('/')}`);
    }
  }

  for (const [name, entry] of declaredLicensed) {
    const path = resolve(licensedDir, name);
    if (!existsSync(path)) {
      failures.push(`declared licensed file is missing: ${name}`);
      continue;
    }
    const licence = accepted.get(entry.licence);
    if (licence === undefined) {
      failures.push(`${name}: licence "${entry.licence}" is not on the accepted list`);
      continue;
    }
    // A credit that is not written down is a credit that will not ship.
    if (licence.attributionRequired && !entry.attribution?.trim()) {
      failures.push(`${name}: ${entry.licence} requires attribution but no credit line is recorded`);
    }
    if (!entry.sourceUrl?.trim()) failures.push(`${name}: no sourceUrl recorded`);
    if (!entry.author?.trim()) failures.push(`${name}: no author recorded`);
    // The hash is what proves the shipped bytes are the ones the licence was checked against.
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (entry.sha256 !== actual) {
      failures.push(`${name}: sha256 does not match the recorded value (recorded ${entry.sha256 ?? 'none'}, actual ${actual})`);
    }
  }

  return failures;
}

/** The credit lines the app must show, in a stable order. Empty when nothing needs credit. */
export function requiredAttributions() {
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  const accepted = new Map(evidence.acceptedLicences.map((entry) => [entry.id, entry]));
  return evidence.licensed
    .filter((entry) => accepted.get(entry.licence)?.attributionRequired === true)
    .map((entry) => entry.attribution)
    .sort((left, right) => left.localeCompare(right));
}

function main() {
  const failures = checkAudioProvenance();
  if (failures.length > 0) {
    process.stderr.write(`audio provenance failures:\n${failures.map((line) => `  - ${line}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  const synthesised = evidence.synthesised.reduce((total, entry) => total + entry.files.length, 0);
  process.stdout.write(
    `audio provenance ok: ${synthesised} synthesised, ${evidence.licensed.length} licensed, `
    + `${requiredAttributions().length} credit lines required\n`,
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
