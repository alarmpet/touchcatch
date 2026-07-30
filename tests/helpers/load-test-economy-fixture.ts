import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { canonicalJsonSha256 } from '../../packages/contracts/src/canonical-json.js';
import { validateEconomyBundleCore } from '../../packages/contracts/src/economy.schema.js';
import type { LoadedApprovedEconomyV1 } from '../../packages/contracts/src/economy.js';

const fixtureRoot=resolve('tests/fixtures/economy');
export async function loadTestEconomyFixture(economyName='approved-v1.0.0.test.json',catalogName='approved-pet-catalog-v1.test.json'):Promise<LoadedApprovedEconomyV1>{
  const economyPath=resolve(fixtureRoot,economyName); const catalogPath=resolve(fixtureRoot,catalogName);
  if(!economyPath.startsWith(`${fixtureRoot}${sep}`)||!catalogPath.startsWith(`${fixtureRoot}${sep}`)) throw new TypeError('test fixture path escape');
  const marker=JSON.parse(await readFile(economyPath,'utf8')) as {testOnly?:string}; const catalogMarker=JSON.parse(await readFile(catalogPath,'utf8')) as {testOnly?:string};
  if(marker.testOnly!=='TEST_ONLY_TRANSACTION_PROBE'||catalogMarker.testOnly!=='TEST_ONLY_TRANSACTION_PROBE') throw new TypeError('test-only marker required');
  const catalogDraft=JSON.parse(await readFile(resolve('config/pet-catalog.v1.json'),'utf8')) as {schemaVersion:1;catalogRevision:string;entries:Array<{petId:string;rarity:'COMMON'|'RARE'|'LEGENDARY';displayKey:string}>};
  const entries=catalogDraft.entries.map((entry,index)=>({...entry,petId:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`}));
  const catalogCore={schemaVersion:1 as const,catalogRevision:catalogDraft.catalogRevision,entries};
  const catalog={...catalogCore,catalogHash:canonicalJsonSha256(catalogCore),status:'APPROVED' as const,approvalDecisionId:'TEST-DECISION',approvedBy:'test-approver',approvedAt:'2026-07-15T00:00:00.000Z'};
  const economyDraft=JSON.parse(await readFile(resolve('config/economy.v1.json'),'utf8')) as Record<string,unknown>;
  const economy={...economyDraft,catalogRevision:catalog.catalogRevision,catalogHash:catalog.catalogHash,status:'APPROVED' as const,approvalDecisionId:'TEST-DECISION',approvedBy:'test-approver',approvedAt:'2026-07-15T00:00:00.000Z',rewardPolicies:{MATCH_GACHA_POINTS:1}};
  const loaded=validateEconomyBundleCore(economy,catalog,{});
  return {config:loaded.economy,economyVersion:loaded.economy.economyVersion,economyHash:loaded.economyHash,catalog:loaded.catalog,catalogRevision:loaded.catalog.catalogRevision,catalogHash:loaded.catalog.catalogHash,catalogArtifactHash:loaded.catalogArtifactHash,pitySeriesId:loaded.economy.pitySeriesId,pitySemanticsHash:loaded.economy.pitySemanticsHash,publishInput:{economy:{...loaded.economy,economyHash:loaded.economyHash},catalog:{...loaded.catalog,catalogArtifactHash:loaded.catalogArtifactHash}}};
}
