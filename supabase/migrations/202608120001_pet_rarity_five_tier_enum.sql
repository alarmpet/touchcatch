-- Extend the admitted pet rarity ladder to five tiers.
--
-- Ladder order (ascending): COMMON < UNCOMMON < RARE < EPIC < LEGENDARY
-- Korean product labels: 일반 / 고급 / 희귀 / 영웅 / 전설
--
-- New enum labels must land in their own migration: PostgreSQL allows
-- `alter type ... add value` inside a transaction block, but the new label
-- cannot be referenced until that transaction has committed. Every constraint,
-- function and guard that uses UNCOMMON or EPIC therefore lives in the
-- following migration.

alter type public.pet_rarity add value if not exists 'UNCOMMON' after 'COMMON';
alter type public.pet_rarity add value if not exists 'EPIC' before 'LEGENDARY';
