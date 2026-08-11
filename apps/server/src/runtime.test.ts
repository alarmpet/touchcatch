import { createServer } from 'node:http';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadRuntimeConfiguration, startMobileApiRuntime } from './runtime.js';

describe('mobile API runtime configuration', () => {
  it('loads current policy artifacts fail-closed and defaults to loopback', () => {
    const config = loadRuntimeConfiguration({
      root: resolve('.'),
      env: {
        SUPABASE_URL: 'https://project.supabase.co',
        DATABASE_URL: 'postgresql://runtime:secret@127.0.0.1:54322/postgres',
      },
    });
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8787);
    expect(config.allowedOrigins).toEqual([]);
    expect(config.policy).toEqual({
      rewards: { enabled: false, code: 'PET_ART_NOT_APPROVED' },
      ranking: { enabled: false, code: 'RANKING_POLICY_NOT_APPROVED' },
    });
  });

  it('starts fail-closed when the optional art manifest is missing or malformed', () => {
    mkdirSync('D:\\tcbuild', { recursive: true });
    const root = mkdtempSync('D:\\tcbuild\\runtime-art-fail-closed-');
    try {
      mkdirSync(resolve(root, 'config'), { recursive: true });
      mkdirSync(resolve(root, 'content/pets'), { recursive: true });
      for (const name of ['economy.v1.json', 'pet-catalog.v1.json', 'daily-pet-loop.v1.json', 'weekly-competition.v1.json']) {
        copyFileSync(resolve('config', name), resolve(root, 'config', name));
      }
      copyFileSync(resolve('content/pets/source-manifest.v1.json'), resolve(root, 'content/pets/source-manifest.v1.json'));
      const env = { SUPABASE_URL: 'https://project.supabase.co', DATABASE_URL: 'postgresql://runtime:secret@127.0.0.1:54322/postgres' };
      expect(loadRuntimeConfiguration({ root, env }).policy.rewards).toEqual({ enabled: false, code: 'PET_ART_NOT_APPROVED' });
      writeFileSync(resolve(root, 'config/pet-runtime-art.v1.json'), '{ malformed', 'utf8');
      expect(loadRuntimeConfiguration({ root, env }).policy.rewards).toEqual({ enabled: false, code: 'PET_ART_NOT_APPROVED' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('validates ports, database protocols, and exact browser origins at startup', () => {
    const base = {
      root: resolve('.'),
      env: {
        SUPABASE_URL: 'https://project.supabase.co',
        DATABASE_URL: 'postgresql://runtime:secret@127.0.0.1:54322/postgres',
      },
    } as const;
    expect(() => loadRuntimeConfiguration({ ...base, env: { ...base.env, MOBILE_API_PORT: '0' } })).toThrow('MOBILE_API_PORT');
    expect(() => loadRuntimeConfiguration({ ...base, env: { ...base.env, DATABASE_URL: 'https://database.example' } })).toThrow('DATABASE_URL');
    expect(() => loadRuntimeConfiguration({ ...base, env: { ...base.env, MOBILE_API_ALLOWED_ORIGINS: 'https://app.example/path' } })).toThrow('MOBILE_API_ALLOWED_ORIGINS');

    const allowed = loadRuntimeConfiguration({
      ...base,
      env: { ...base.env, MOBILE_API_HOST: '0.0.0.0', MOBILE_API_PORT: '9000', MOBILE_API_ALLOWED_ORIGINS: 'https://app.example,http://localhost:8081' },
    });
    expect(allowed).toMatchObject({ host: '0.0.0.0', port: 9000, allowedOrigins: ['https://app.example', 'http://localhost:8081'] });
  });

  it('serves current policy-disabled routes without opening a database connection', async () => {
    const loaded = loadRuntimeConfiguration({
      root: resolve('.'),
      env: {
        SUPABASE_URL: 'https://project.supabase.co',
        DATABASE_URL: 'postgresql://runtime:secret@127.0.0.1:54322/postgres',
      },
    });
    const connect = vi.fn(async () => { throw new Error('must not connect'); });
    const end = vi.fn(async () => undefined);
    const server = await startMobileApiRuntime({
      configuration: { ...loaded, port: 0 },
      verifier: { verify: async () => ({ authenticatedUserId: '10000000-0000-4000-8000-000000000001' }) },
      pool: { connect, end, destroy: vi.fn() },
    });
    try {
      const requests = [
        fetch(`${server.origin}/v1/pets/collection`, { headers: { authorization: 'Bearer local-test' } }),
        fetch(`${server.origin}/v1/pets/daily-draw`, { method: 'POST', headers: { authorization: 'Bearer local-test' } }),
        fetch(`${server.origin}/v1/pets/duplicate-promotion`, { method: 'POST', headers: { authorization: 'Bearer local-test', 'content-type': 'application/json' }, body: '{}' }),
        fetch(`${server.origin}/v1/learning/leaderboard?seasonId=30000000-0000-4000-8000-000000000001&category=ENGLISH&limit=10`, { headers: { authorization: 'Bearer local-test' } }),
      ];
      const responses = await Promise.all(requests);
      expect(await Promise.all(responses.map(async (response) => [response.status, (await response.json()).code]))).toEqual([
        [409, 'PET_ART_NOT_APPROVED'],
        [409, 'PET_ART_NOT_APPROVED'],
        [409, 'PET_ART_NOT_APPROVED'],
        [409, 'RANKING_POLICY_NOT_APPROVED'],
      ]);
      expect(connect).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
    expect(end).toHaveBeenCalledOnce();
  });

  it('closes the database pool when the listener cannot start', async () => {
    const occupied = createServer();
    await new Promise<void>((resolveReady) => occupied.listen(0, '127.0.0.1', resolveReady));
    const port = (occupied.address() as AddressInfo).port;
    const end = vi.fn(async () => undefined);
    try {
      await expect(startMobileApiRuntime({
        configuration: {
          ...loadRuntimeConfiguration({
            root: resolve('.'),
            env: { SUPABASE_URL: 'https://project.supabase.co', DATABASE_URL: 'postgresql://runtime:secret@127.0.0.1:54322/postgres' },
          }),
          port,
        },
        verifier: { verify: async () => ({ authenticatedUserId: '10000000-0000-4000-8000-000000000001' }) },
        pool: { connect: async () => { throw new Error('unused'); }, end, destroy: vi.fn() },
      })).rejects.toMatchObject({ code: 'EADDRINUSE' });
      expect(end).toHaveBeenCalledOnce();
    } finally {
      await new Promise<void>((resolveClosed, reject) => occupied.close((error) => error ? reject(error) : resolveClosed()));
    }
  });

  it('forces active database clients closed when pool shutdown exceeds its grace period', async () => {
    let finishEnd: (() => void) | undefined;
    const end = vi.fn(() => new Promise<void>((resolve) => { finishEnd = resolve; }));
    const destroy = vi.fn(() => finishEnd?.());
    const server = await startMobileApiRuntime({
      configuration: {
        ...loadRuntimeConfiguration({
          root: resolve('.'),
          env: { SUPABASE_URL: 'https://project.supabase.co', DATABASE_URL: 'postgresql://runtime:secret@127.0.0.1:54322/postgres' },
        }),
        port: 0,
      },
      verifier: { verify: async () => ({ authenticatedUserId: '10000000-0000-4000-8000-000000000001' }) },
      pool: { connect: async () => { throw new Error('unused'); }, end, destroy },
      dependencyShutdownGraceMs: 10,
    });
    await expect(server.close()).resolves.toBeUndefined();
    expect(end).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
