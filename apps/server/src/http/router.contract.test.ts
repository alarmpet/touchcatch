import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { PUBLIC_MOBILE_API_OPERATIONS } from './router.js';

type Document = { paths: Record<string, Record<string, unknown>> };

function openApiOperations(file: string): string[] {
  const document = parse(readFileSync(file, 'utf8')) as Document;
  return Object.entries(document.paths).flatMap(([path, item]) =>
    Object.keys(item)
      .filter((method) => ['get', 'post', 'delete', 'put', 'patch'].includes(method))
      .map((method) => `${method.toUpperCase()} ${path}`));
}

describe('OpenAPI and runtime router contract', () => {
  it('keeps public OpenAPI operations identical to the Fetch router', () => {
    const documented = openApiOperations('packages/contracts/openapi.yaml').sort();
    const implemented = PUBLIC_MOBILE_API_OPERATIONS
      .map((operation) => `${operation.method} ${operation.path}`)
      .sort();
    expect(documented).toEqual(implemented);
  });

  it('fails if OpenAPI grows a route the router does not serve', () => {
    expect(openApiOperations('packages/contracts/openapi.yaml')).not.toContain('POST /v1/gacha/draw');
    expect(openApiOperations('packages/contracts/openapi.planned.yaml')).toContain('POST /v1/gacha/draw');
  });

  it('does not list healthz or readiness in the public OpenAPI', () => {
    expect(openApiOperations('packages/contracts/openapi.yaml')).not.toContain('GET /healthz');
    expect(openApiOperations('packages/contracts/openapi.yaml')).not.toContain('GET /ready');
  });
});
