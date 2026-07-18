import type { DeploymentPublisher } from './publish-workflow.js';

type DeploymentConnection = Readonly<{
  query(sql: string, values: readonly unknown[]): Promise<{ rows: readonly { content_revision_id: string }[] }>;
}>;

export function createDeploymentPublisher(connection: DeploymentConnection): DeploymentPublisher {
  return {
    async publish(input) {
      const result = await connection.query(
        'select private.publish_content_revision_v1($1,$2,$3,$4,$5,$6,$7)::text as content_revision_id',
        [input.publicContent, input.privateSolution, input.rightsManifest, input.publicContentCanonicalJson, input.privateSolutionCanonicalJson, input.rightsManifestCanonicalJson, '1.0.0'],
      );
      const contentRevisionId = result.rows[0]?.content_revision_id;
      if (!contentRevisionId) throw new Error('DEPLOYMENT_PUBLISH_EMPTY_RESULT');
      return { publishId: `content:${contentRevisionId}`, contentRevisionId };
    },
  };
}
import 'server-only';
