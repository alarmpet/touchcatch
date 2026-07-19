import { describe, expect, it } from 'vitest';
import { createDeploymentPublisher } from './testing/deployment-publisher.js';

describe('deployment-only publisher adapter', () => {
  it('calls only the existing attested publish function with canonical values', async () => {
    const calls: unknown[][] = [];
    const publisher = createDeploymentPublisher({ query: async (sql, values) => {
      calls.push([sql, values]);
      return { rows: [{ content_revision_id: 'revision-1' }] };
    } });
    const result = await publisher.publish({
      publicContent: { contentRevisionId: 'revision-1' } as never,
      privateSolution: {} as never,
      rightsManifest: {} as never,
      publicContentCanonicalJson: '{}', privateSolutionCanonicalJson: '{}', rightsManifestCanonicalJson: '{}',
      validatorAttestation: { artifactHash: 'a'.repeat(64), actorId: 'actor-safe', sessionId: 'session-safe' },
    });
    expect(calls).toEqual([[expect.stringMatching(/^select private\.publish_content_revision_v1\(\$1,\$2,\$3,\$4,\$5,\$6,\$7\)::text as content_revision_id$/u), expect.any(Array)]]);
    expect(result).toEqual({ publishId: 'content:revision-1', contentRevisionId: 'revision-1' });
  });
});
