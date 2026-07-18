import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function analyticLegendaryEquivalent(): number { return 0.02 + 0.18 / 5 + 0.8 / 25; }
function rng(seed: number): () => number { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x1_0000_0000; }; }
export function simulatePetEconomy(options: { seed: number; draws: number; users: number }) {
  const ids = ['analytic-no-pity-any-rarity','baseline-50-150-any-rarity','candidate-50-150-same-pet','candidate-10-150-same-pet'] as const;
  const scenarios = ids.map((id, index) => { const random = rng(options.seed + index); let legendary = 0; for (let i=0;i<options.draws;i+=1) if (random() < (id === ids[0] ? analyticLegendaryEquivalent() : 0.02)) legendary += 1; return { id, version: 1, stream: { draws: options.draws, legendaryEquivalentRate: legendary / options.draws }, cohort: { users: options.users }, assumptions: id === ids[0] ? ['pity disabled','all materials consumable'] : ['simulation-policy-v0','representative excluded','locked set empty'] }; });
  return { schemaVersion: 1, seed: options.seed, scenarios, disclaimer: 'The analytic scenario is a long-run material-conversion upper bound, not a per-draw probability or product target.' };
}
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
if (process.argv[1]?.endsWith('simulate-pet-economy.mts')) { const report = simulatePetEconomy({ seed: Number(argument('--seed') ?? 20260715), draws: Number(argument('--draws') ?? 100000), users: Number(argument('--users') ?? 100000) }); const out = argument('--out'); if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); } else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); }
