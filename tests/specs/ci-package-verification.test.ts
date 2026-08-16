import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

type PackageManifest = {
  scripts?: Record<string, string>;
};

describe('package-level verification coverage', () => {
  it('requires package scripts and CI jobs for server and mobile verification', () => {
    const rootPackage = JSON.parse(fs.readFileSync('package.json', 'utf8')) as PackageManifest;
    const serverPackage = JSON.parse(fs.readFileSync('apps/server/package.json', 'utf8')) as PackageManifest;
    const mobilePackage = JSON.parse(fs.readFileSync('apps/mobile/package.json', 'utf8')) as PackageManifest;
    const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');

    expect(rootPackage.scripts?.['server:typecheck']).toBe('tsc -p apps/server/tsconfig.json --noEmit');
    expect(rootPackage.scripts?.['server:test']).toBe('vitest run apps/server/src');
    expect(rootPackage.scripts?.['server:check']).toBe('pnpm server:typecheck && pnpm server:test');
    expect(rootPackage.scripts?.['mobile:typecheck']).toBe('tsc -p apps/mobile/tsconfig.json --noEmit');
    expect(rootPackage.scripts?.['mobile:web:build']).toBe('pnpm --dir apps/mobile web:build');
    expect(rootPackage.scripts?.['mobile:contracts']).toBe('vitest run apps/mobile/src apps/mobile/app');
    expect(rootPackage.scripts?.['mobile:check']).toBe('pnpm mobile:contracts && pnpm mobile:typecheck && pnpm mobile:web:build');

    expect(serverPackage.scripts?.typecheck).toBeDefined();
    expect(serverPackage.scripts?.test).toBeDefined();

    expect(mobilePackage.scripts?.typecheck).toBeDefined();
    expect(mobilePackage.scripts?.['web:build']).toBeDefined();

    expect(workflow).toContain('server:');
    expect(workflow).toContain('mobile:');
    expect(workflow).toContain('name: local contract/build evidence (check)');
    expect(workflow).toContain('name: local contract/build evidence (database)');
    expect(workflow).toContain('name: local contract/build evidence (server)');
    expect(workflow).toContain('name: local contract/build evidence (mobile)');
    expect(workflow).toContain('run: pnpm server:check');
    expect(workflow).toContain('run: pnpm mobile:check');
    expect(workflow).not.toMatch(/production readiness/i);
  });
});
