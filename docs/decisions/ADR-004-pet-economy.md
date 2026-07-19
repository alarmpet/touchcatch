# ADR-004: Pet economy remains DRAFT until product approval

Status: Proposed / deployment-blocked

The repository freezes only values already present in the product specification: a 100-point draw, COMMON/RARE/LEGENDARY probabilities of 80/18/2 percent, hard pity at 50 and 150 direct draws, five-copy COMMON→RARE and RARE→LEGENDARY fusion, protected selected/locked pets, EXP values 100/60/+40, and catalog grouping 30/15/5.

`simulation-policy-v0` is an analysis assumption, not an approved product rule. It increments counters before each direct draw, gives legendary hard pity precedence, upgrades COMMON to RARE at rare pity, overrides any roll to LEGENDARY at legendary pity, resets the rare counter on direct rare-or-better and both counters on direct legendary, and does not count fusion. The analytic 0.088 result is only a no-pity, all-materials-consumable long-run upper bound.

No production point reward schedule, match-mode mapping, within-rarity weighting, EXP recipient, optional lock-behaviour distribution, retention job, active-generation dispatcher, outbox delivery/retry, or incompatible pity-series migration is approved. The only point award in transaction tests is the isolated `TEST_ONLY_TRANSACTION_PROBE` policy `MATCH_GACHA_POINTS +1`. Unsupported reward policies must commit no ledger, balance, or outbox effect.

An approved revision is immutable. Compatible versions may retain pity only when both series ID and the complete semantics projection/hash are identical. Any incompatible activation fails closed as `UNSUPPORTED_SERIES_MIGRATION` until a later activation ADR and migration provide generation fencing and counter migration.
