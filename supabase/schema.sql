-- Come Up: cloud saves schema.
-- Paste this whole file into Supabase -> SQL Editor and run it once. It is safe to re-run.
--
-- Security model: every row belongs to one user (user_id). Row-level security (RLS) lets a signed-in user
-- see and change only their own rows. The publishable key shipped in the app has no other power.

-- ── saves: one row per career ──────────────────────────────────────────────
create table if not exists public.saves (
  user_id        uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id             text        not null,                 -- the game's own save id
  name           text        not null default '',
  subtitle       text        not null default '',
  data           jsonb       not null,                 -- the full GameState (validated by the app on load)
  schema_version int         not null default 1,       -- SAVE_VERSION at the time of the upload
  client_updated bigint      not null default 0,       -- device clock (ms) of the last edit, for display only
  deleted        boolean     not null default false,   -- tombstone, so a delete reaches the other devices
  rev            integer     not null default 1,       -- bumped by the server on every change (conflict check)
  updated_at     timestamptz not null default now(),   -- server time of the last change
  primary key (user_id, id)
);

-- ── legends: the Hall of Fame, one row per finished career ────────────────
create table if not exists public.legends (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  data       jsonb       not null,
  deleted    boolean     not null default false,
  rev        integer     not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ── the server owns rev and updated_at, and a row can never change hands ──
create or replace function public.bump_rev() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id    := old.user_id;
  new.rev        := old.rev + 1;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists saves_bump_rev on public.saves;
create trigger saves_bump_rev before update on public.saves
  for each row execute function public.bump_rev();

drop trigger if exists legends_bump_rev on public.legends;
create trigger legends_bump_rev before update on public.legends
  for each row execute function public.bump_rev();

-- ── row-level security ────────────────────────────────────────────────────
alter table public.saves   enable row level security;
alter table public.legends enable row level security;

drop policy if exists "saves: own rows"   on public.saves;
drop policy if exists "legends: own rows" on public.legends;

create policy "saves: own rows" on public.saves
  for all to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "legends: own rows" on public.legends
  for all to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- signed-out visitors get no access at all
revoke all on public.saves   from anon;
revoke all on public.legends from anon;
grant select, insert, update, delete on public.saves   to authenticated;
grant select, insert, update, delete on public.legends to authenticated;

-- ── challenge leaderboard ──────────────────────────────────────────────────
-- One best score per player per challenge. Scores are sent by the app and are NOT verified by the server, so treat
-- the board as friendly competition. Only the character's name is shown; no email or account id is ever exposed.
create table if not exists public.challenge_scores (
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  challenge_id text        not null,
  player_name  text        not null default '',
  score        numeric     not null,
  tier_label   text        not null default '',
  titles       int         not null default 0,
  seasons      int         not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (user_id, challenge_id),
  constraint challenge_id_len check (char_length(challenge_id) <= 40),
  constraint player_name_len  check (char_length(player_name) <= 40),
  constraint score_sane       check (score >= 0 and score <= 2000)
);
create index if not exists challenge_scores_rank on public.challenge_scores (challenge_id, score desc);

alter table public.challenge_scores enable row level security;
drop policy if exists "scores: anyone signed in can read" on public.challenge_scores;
drop policy if exists "scores: write own"                 on public.challenge_scores;
drop policy if exists "scores: update own"                on public.challenge_scores;
create policy "scores: anyone signed in can read" on public.challenge_scores for select to authenticated using (true);
create policy "scores: write own"  on public.challenge_scores for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "scores: update own" on public.challenge_scores for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.challenge_scores from anon;
grant select, insert, update on public.challenge_scores to authenticated;
