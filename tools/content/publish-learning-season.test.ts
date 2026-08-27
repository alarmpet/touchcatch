import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../packages/contracts/src/canonical-json.js';
import { buildCandidateBundle, preflight, repointAssets, type ApprovalBundle } from './publish-learning-season.js';

/**
 * Preflight exists so the operator learns which pack failed and by how much, rather than
 * reading `PRIVATE_CONTENT_VALUE_INVALID` off a rolled-back transaction. These pin that it
 * mirrors the database's predicates rather than drifting into a second, softer opinion.
 */
describe('learning season publish preflight', () => {
  const root = resolve(import.meta.dirname, '../..');
  /** Derives exactly ten differences, so it is the shape the ruleset admits today. */
  const key = 'en-clay-bakery';

  function mutate(bundle: ApprovalBundle, privateSolution: Record<string, unknown>): ApprovalBundle {
    const { privateSolutionHash: _omitted, ...rest } = privateSolution;
    return {
      ...bundle,
      privateSolution: {
        ...rest,
        privateSolutionHash: createHash('sha256').update(Buffer.from(canonicalJson(rest), 'utf8')).digest('hex'),
      },
    };
  }

  it('admits a bundle built from the artwork and the curated hunts', () => {
    const bundle = buildCandidateBundle(root, key);
    const differences = bundle.privateSolution['differences'] as { tier: string }[];
    expect(differences).toHaveLength(10);
    expect(differences.filter((difference) => difference.tier === 'NORMAL')).toHaveLength(7);
    expect(differences.filter((difference) => difference.tier === 'HARD')).toHaveLength(3);
    expect(preflight(root, [bundle])).toEqual([]);
  });

  it('names the pack and the shortfall when the artwork yields too few differences', () => {
    const bundle = buildCandidateBundle(root, key);
    const differences = (bundle.privateSolution['differences'] as unknown[]).slice(0, 9);
    const findings = preflight(root, [mutate(bundle, { ...bundle.privateSolution, differences })]);

    expect(findings.map((finding) => finding.check)).toContain('DIFFERENCE_COUNT');
    expect(findings.every((finding) => finding.pack === key)).toBe(true);
    expect(findings.find((finding) => finding.check === 'DIFFERENCE_COUNT')?.detail)
      .toBe('9 differences, ruleset requires 10');
  });

  it('rejects a solution whose attestation does not cover it', () => {
    const bundle = buildCandidateBundle(root, key);
    const tampered: ApprovalBundle = {
      ...bundle,
      privateSolution: { ...bundle.privateSolution, privateSolutionHash: 'f'.repeat(64) },
    };
    expect(preflight(root, [tampered]).map((finding) => finding.check)).toContain('PRIVATE_SOLUTION_HASH');
  });

  it('repoints assets at a new origin without disturbing the bytes they attest to', () => {
    const bundle = buildCandidateBundle(root, key);
    const moved = repointAssets(bundle, 'http://10.0.2.2:8788/');
    const before = bundle.publicContent['imageA'] as Record<string, string>;
    const after = moved.publicContent['imageA'] as Record<string, string>;

    expect(after['sha256']).toBe(before['sha256']);
    expect(after['url']).toBe(`http://10.0.2.2:8788/assets/${before['sha256']}.png`);
    // The URL is inside the hashed document, so the revision has to move with it.
    expect(moved.publicContent['contentRevisionId']).not.toBe(bundle.publicContent['contentRevisionId']);
    expect(moved.privateSolution['contentRevisionId']).toBe(moved.publicContent['contentRevisionId']);
    expect(preflight(root, [moved])).toEqual([]);
    // Re-running the same move must land on the same revision, or a redeploy forks the content.
    expect(repointAssets(bundle, 'http://10.0.2.2:8788').publicContent['contentRevisionId'])
      .toBe(moved.publicContent['contentRevisionId']);
  });

  it('rejects publicContent that is missing a key the database requires', () => {
    const bundle = buildCandidateBundle(root, key);
    const { category: _dropped, ...withoutCategory } = bundle.publicContent;
    const findings = preflight(root, [{ ...bundle, publicContent: withoutCategory }]);

    expect(findings.find((finding) => finding.check === 'PUBLIC_CONTENT_KEYS')?.detail)
      .toBe('missing [category] extra []');
  });
});
