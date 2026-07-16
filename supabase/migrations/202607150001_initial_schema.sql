create extension if not exists "uuid-ossp" with schema extensions;
create type public.pet_rarity as enum ('COMMON','RARE','LEGENDARY');
create type public.match_status as enum ('WAITING','COUNTDOWN','PLAYING','FINAL_RUSH','FINISHED','CANCELLED');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  level int not null default 1,
  exp bigint not null default 0,
  gacha_points int not null default 0,
  created_at timestamptz not null default now()
);

create table public.pet_catalog (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null,
  rarity public.pet_rarity not null,
  species text not null,
  image_url text not null,
  active boolean not null default true
);

create table public.user_pets (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pet_id uuid not null references public.pet_catalog(id),
  level int not null default 1,
  exp bigint not null default 0,
  copies int not null default 1,
  locked boolean not null default false,
  selected boolean not null default false,
  unique(user_id, pet_id)
);

create table public.game_contents (
  id uuid primary key default extensions.uuid_generate_v4(),
  theme text not null,
  language text not null,
  difficulty text not null,
  image_a_url text not null,
  image_b_url text not null,
  final_answer text not null,
  answer_aliases jsonb not null default '[]',
  meaning_question jsonb not null,
  content_json jsonb not null,
  status text not null default 'DRAFT',
  version int not null default 1
);

create table public.matches (
  id uuid primary key default extensions.uuid_generate_v4(),
  content_id uuid not null references public.game_contents(id),
  status public.match_status not null default 'WAITING',
  started_at timestamptz,
  ended_at timestamptz,
  winner_user_id uuid references public.profiles(id),
  end_reason text,
  server_version text not null
);

create table public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  score int not null default 0,
  final_answer_correct boolean not null default false,
  meaning_correct boolean not null default false,
  reward_claimed boolean not null default false,
  primary key(match_id,user_id)
);

create table public.match_events (
  id bigserial primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid references public.profiles(id),
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
