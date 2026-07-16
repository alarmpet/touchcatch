import packageManifest from '../../../package.json' with { type: 'json' };
import { ASSET_PUBLISH_LIMITS_V1 } from './content.js';
import { parseMatchStateV1 } from './match.schema.js';
import { clientCommandEnvelopeSchema } from './socket.schema.js';
import { normalizeFinalAnswer } from './answer-normalization.js';

const runtimeTuple = Object.freeze({ node: packageManifest.engines.node, pnpm: packageManifest.engines.pnpm });

/** Evidence is derived from executable imports and pinned values, never caller-supplied flags. */
export const CONTENT_INTEGRATION_EVIDENCE = Object.freeze({
  runtimeTuple,
  matchContract: typeof parseMatchStateV1 === 'function',
  terminalMapping: typeof parseMatchStateV1 === 'function',
  wireNormalizationAndLimits:
    typeof clientCommandEnvelopeSchema.safeParse === 'function' &&
    normalizeFinalAnswer('Ａ') === 'a' &&
    ASSET_PUBLISH_LIMITS_V1.maxEncodedBytes === 8 * 1024 * 1024 &&
    ASSET_PUBLISH_LIMITS_V1.maxWidth === 4096 &&
    ASSET_PUBLISH_LIMITS_V1.maxHeight === 4096 &&
    ASSET_PUBLISH_LIMITS_V1.maxDecodedPixels === 16_000_000,
});

export function parseContentAssetOrigins(value: string): readonly string[] {
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (!items.length) throw new Error('CONTENT_ASSET_ORIGINS requires at least one HTTPS origin');
  const normalized = items.map((origin) => {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:' || parsed.origin !== origin || parsed.pathname !== '/' || parsed.port || parsed.username || parsed.password) {
      throw new Error('CONTENT_ASSET_ORIGINS entries must be an exact HTTPS origin');
    }
    return origin;
  }).sort();
  if (new Set(normalized).size !== normalized.length) throw new Error('CONTENT_ASSET_ORIGINS contains a duplicate origin');
  return normalized;
}
