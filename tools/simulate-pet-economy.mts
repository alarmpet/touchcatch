import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function analyticLegendaryEquivalent(): number { return 0.02 + 0.18 / 5 + 0.8 / 25; }
function rng(seed: number): () => number { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x1_0000_0000; }; }
export function simulatePetEconomy(options: { seed: number; draws: number; users: number }) {
  const ids = ['analytic-no-pity-any-rarity','baseline-50-150-any-rarity','candidate-50-150-same-pet','candidate-10-150-same-pet'] as const;
  const scenarios = ids.map((id, index) => {
    const random = rng(options.seed + index); const inventory={COMMON:0,RARE:0,LEGENDARY:0};const pets={COMMON:Array(30).fill(0) as number[],RARE:Array(15).fill(0) as number[],LEGENDARY:Array(5).fill(0) as number[]};
    const pityTriggers={rare:0,legendary:0}; let rareCounter=0; let legendaryCounter=0;
    const rareThreshold=id===ids[3]?10:50; const pity=id!==ids[0];
    for(let i=0;i<options.draws;i+=1){rareCounter+=1;legendaryCounter+=1;const roll=random();let rarity:'COMMON'|'RARE'|'LEGENDARY'=roll<.02?'LEGENDARY':roll<.2?'RARE':'COMMON';if(pity&&legendaryCounter>=150){rarity='LEGENDARY';pityTriggers.legendary+=1;}else if(pity&&rareCounter>=rareThreshold&&rarity==='COMMON'){rarity='RARE';pityTriggers.rare+=1;}inventory[rarity]+=1;pets[rarity][Math.floor(random()*pets[rarity].length)]!+=1;if(rarity==='LEGENDARY'){rareCounter=0;legendaryCounter=0;}else if(rarity==='RARE')rareCounter=0;}
    const samePet=id.includes('same-pet');const excluded=samePet?0:-1;const commonFusions=samePet?pets.COMMON.reduce((n,c,i)=>n+(i===excluded?0:Math.floor(c/5)),0):Math.floor(inventory.COMMON/5);const rarePool=inventory.RARE+commonFusions;const rareFusions=samePet?pets.RARE.reduce((n,c,i)=>n+(i===excluded?0:Math.floor(c/5)),0):Math.floor(rarePool/5);const consumedCommon=commonFusions*5;const consumedRare=rareFusions*5;inventory.COMMON-=consumedCommon;inventory.RARE=rarePool-consumedRare;inventory.LEGENDARY+=rareFusions;
    const cohortRandom=rng(options.seed+10_000+index);const first:number[]=[];
    for(let user=0;user<options.users;user+=1){let found=150;for(let draw=1;draw<=150;draw+=1){if(cohortRandom()<.02||pity&&draw===150){found=draw;break;}}first.push(found);}first.sort((a,b)=>a-b);
    return {id,version:1,stream:{draws:options.draws,legendaryEquivalentRate:inventory.LEGENDARY/options.draws,inventory,pityTriggers,fusion:{commonOutputs:commonFusions,legendaryOutputs:rareFusions,consumedCommon,consumedRare}},cohort:{users:options.users,firstLegendaryMedian:first[Math.floor(first.length*.5)]??0,firstLegendaryP95:first[Math.floor(first.length*.95)]??0},checks:{representativeExcluded:samePet,protectedPetsExcluded:samePet,samePetRuleApplied:samePet},assumptions:id===ids[0]?['pity disabled','all materials consumable']:['simulation-policy-v0','representative excluded','locked set empty']};
  });
  return { schemaVersion: 1, seed: options.seed, scenarios, disclaimer: 'The analytic scenario is a long-run material-conversion upper bound, not a per-draw probability or product target.' };
}
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
if (process.argv[1]?.endsWith('simulate-pet-economy.mts')) { const report = simulatePetEconomy({ seed: Number(argument('--seed') ?? 20260715), draws: Number(argument('--draws') ?? 100000), users: Number(argument('--users') ?? 100000) }); const out = argument('--out'); if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); } else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); }
