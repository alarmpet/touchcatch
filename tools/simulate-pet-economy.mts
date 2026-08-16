import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function analyticLegendaryEquivalent(): number { return 0.02 + 0.18 / 5 + 0.8 / 25; }
function rng(seed: number): () => number { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x1_0000_0000; }; }
export function chooseSamePetFusionOutput<T>(random: () => number, outputIds: readonly T[]): T {
  if (outputIds.length !== 15) throw new TypeError('same-pet fusion requires all 15 rare output IDs');
  const index = Math.floor(random() * outputIds.length);
  const output = outputIds[index];
  if (output === undefined) throw new RangeError('PRNG output must be in [0, 1)');
  return output;
}
export function simulatePetEconomy(options: { seed: number; draws: number; users: number }) {
  const ids = ['analytic-no-pity-any-rarity','baseline-50-150-any-rarity','candidate-50-150-same-pet','candidate-10-150-same-pet'] as const;
  const scenarios = ids.map((id, index) => {
    const random = rng(options.seed + index); const inventory={COMMON:0,RARE:0,LEGENDARY:0};const pets={COMMON:Array(30).fill(0) as number[],RARE:Array(15).fill(0) as number[],LEGENDARY:Array(5).fill(0) as number[]};
    const pityTriggers={rare:0,legendary:0}; let rareCounter=0; let legendaryCounter=0;
    const rareThreshold=id===ids[3]?10:50; const pity=id!==ids[0];
    for(let i=0;i<options.draws;i+=1){rareCounter+=1;legendaryCounter+=1;const roll=random();/* Admitted 60/25/10/4/1 ladder collapsed onto the populated tiers: UNCOMMON resolves down to COMMON and EPIC resolves down to RARE until art is admitted. */let rarity:'COMMON'|'RARE'|'LEGENDARY'=roll<.01?'LEGENDARY':roll<.15?'RARE':'COMMON';if(pity&&legendaryCounter>=150){rarity='LEGENDARY';pityTriggers.legendary+=1;}else if(pity&&rareCounter>=rareThreshold&&rarity==='COMMON'){rarity='RARE';pityTriggers.rare+=1;}inventory[rarity]+=1;pets[rarity][Math.floor(random()*pets[rarity].length)]!+=1;if(rarity==='LEGENDARY'){rareCounter=0;legendaryCounter=0;}else if(rarity==='RARE')rareCounter=0;}
    const samePet=id.includes('same-pet');const excluded=samePet?0:-1;let commonFusions=0;let propagatedRareCopies=0;let propagatedRareCopiesConsumed=0;const drawnRareOnlyLegendaryOutputs=samePet?pets.RARE.reduce((n,c,i)=>n+(i===excluded?0:Math.floor(c/5)),0):Math.floor(inventory.RARE/5);
    if(samePet){for(let i=0;i<pets.COMMON.length;i+=1){if(i===excluded)continue;const outputs=Math.floor(pets.COMMON[i]!/5);commonFusions+=outputs;for(let output=0;output<outputs;output+=1){const rareIndex=chooseSamePetFusionOutput(random,Array.from({length:15},(_,rareId)=>rareId));pets.RARE[rareIndex]!+=1;}propagatedRareCopies+=outputs;}}
    else commonFusions=Math.floor(inventory.COMMON/5);
    const rarePool=inventory.RARE+commonFusions;const rareFusions=samePet?pets.RARE.reduce((n,c,i)=>n+(i===excluded?0:Math.floor(c/5)),0):Math.floor(rarePool/5);if(samePet)propagatedRareCopiesConsumed=Math.max(0,(rareFusions-drawnRareOnlyLegendaryOutputs)*5);const consumedCommon=commonFusions*5;const consumedRare=rareFusions*5;inventory.COMMON-=consumedCommon;inventory.RARE=rarePool-consumedRare;inventory.LEGENDARY+=rareFusions;
    const cohortRandom=rng(options.seed+10_000+index);const first:number[]=[];
    for(let user=0;user<options.users;user+=1){let found=150;for(let draw=1;draw<=150;draw+=1){if(cohortRandom()<.01||pity&&draw===150){found=draw;break;}}first.push(found);}first.sort((a,b)=>a-b);
    return {id,version:1,stream:{draws:options.draws,legendaryEquivalentRate:inventory.LEGENDARY/options.draws,inventory,pityTriggers,fusion:{commonOutputs:commonFusions,legendaryOutputs:rareFusions,consumedCommon,consumedRare,propagatedRareCopies,propagatedRareCopiesConsumed,drawnRareOnlyLegendaryOutputs}},cohort:{users:options.users,firstLegendaryMedian:first[Math.floor(first.length*.5)]??0,firstLegendaryP95:first[Math.floor(first.length*.95)]??0},checks:{representativeExcluded:samePet,protectedPetsExcluded:samePet,samePetRuleApplied:samePet},assumptions:id===ids[0]?['pity disabled','all materials consumable']:['simulation-policy-v0','representative excluded','locked set empty']};
  });
  return { schemaVersion: 1, seed: options.seed, scenarios, disclaimer: 'The analytic scenario is a long-run material-conversion upper bound, not a per-draw probability or product target.' };
}
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
if (process.argv[1]?.endsWith('simulate-pet-economy.mts')) { const report = simulatePetEconomy({ seed: Number(argument('--seed') ?? 20260715), draws: Number(argument('--draws') ?? 100000), users: Number(argument('--users') ?? 100000) }); const out = argument('--out'); if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); } else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); }
