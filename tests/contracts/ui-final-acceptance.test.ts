import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {compareRegions,validateVisualEnvironment} from '../../apps/mobile/src/ui/visual-runner.js';

describe('Task 7 final acceptance',()=>{
 it('routes the application to BattleScreen and keeps preview explicitly development-only',()=>{const text=readFileSync('apps/mobile/app/index.tsx','utf8');expect(text).toContain('<BattleScreen');expect(text).toContain('__DEV__')});
 it('uses changed-pixel ratio without a global maximum veto',()=>{const golden={width:2,height:1,data:new Uint8Array(8)};const actual={...golden,data:new Uint8Array([255,0,0,0,0,0,0,0])};expect(compareRegions(actual,golden,[{id:'x',x:0,y:0,width:2,height:1,maxChangedRatio:.5,maxChannelDelta:10}],[])[0]?.pass).toBe(true)});
 it('fails closed when visual environment pins differ',()=>{const pins={node:'24.18.0',pnpm:'11.13.0',platform:'android' as const,adapter:'maestro-android@1',viewport:[390,844] as const,locale:'ko-KR'};expect(()=>validateVisualEnvironment(pins,{...pins,node:'24.14.0'})).toThrow(/node/)});
 it('stores a structured unique acceptance matrix',()=>{const rows=JSON.parse(readFileSync('config/ui-acceptance-matrix.v1.json','utf8')) as Array<Record<string,unknown>>;expect(rows.length).toBeGreaterThan(0);expect(new Set(rows.map(x=>x.requirementId)).size).toBe(rows.length);for(const row of rows)for(const key of ['requirementId','platform','viewport','method','expected','evidence','status'])expect(row).toHaveProperty(key)});
 it('rejects the required unapproved beta fixture',()=>{const result=spawnSync(process.execPath,['tools/check-ui-assets.mjs','--target','beta'],{env:{...process.env,UI_ASSET_MANIFEST:'tests/fixtures/ui/invalid-beta-unapproved.json'},encoding:'utf8'});expect(result.status).toBe(1);expect(result.stderr).toContain('beta requires APPROVED')});
 it('keeps the executable visual gate honestly blocked without approved device goldens',()=>{const result=spawnSync(process.execPath,['tools/run-ui-visual.mjs'],{env:{...process.env,UI_PLATFORM:'android',UI_ADAPTER:'maestro-android@1',UI_OS:'Android-15-api35',UI_DEVICE:'Pixel-7',UI_LOCALE:'ko-KR',UI_SEED:'7182026',UI_TIME:'2026-07-18T00:00:00.000Z'},encoding:'utf8'});expect(result.status).toBe(3);expect(result.stderr).toContain('BLOCKED_MANUAL_DEVICE_EVIDENCE')});
});
