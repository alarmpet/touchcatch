import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import YAML from 'yaml';

it('publishes the policy-pending deletion admission and replay contract', () => {
  const api = YAML.parse(readFileSync('packages/contracts/openapi.yaml', 'utf8')) as any;
  expect(api.paths['/v1/me'].delete).toMatchObject({ operationId: 'deleteMe' });
  expect(api.paths['/v1/me'].delete.parameters).toEqual([{ $ref: '#/components/parameters/IdempotencyKey' }]);
  expect(api.paths['/v1/me'].delete.responses).toHaveProperty('202');
  expect(api.paths['/v1/me'].delete.responses).toHaveProperty('409');
  expect(api.components.schemas.AccountDeletionResponse).toMatchObject({ additionalProperties: false, required: ['jobId', 'status', 'policyPending'] });
  expect(api.components.schemas.AccountDeletionResponse.properties).toMatchObject({ status: { const: 'DELETING' }, policyPending: { const: true } });
});
