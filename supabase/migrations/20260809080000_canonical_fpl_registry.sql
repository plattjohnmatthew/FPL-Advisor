create type public.fpl_position as enum ('GK', 'DEF', 'MID', 'FWD');
create type public.fpl_sync_status as enum ('RUNNING', 'COMPLETED', 'FAILED');

create table public.fpl_teams (
  fpl_team_id integer primary key check (fpl_team_id > 0),
  name text not null check (btrim(name) <> ''),
  short_name text not null check (btrim(short_name) <> ''),
  code integer,
  updated_at timestamptz not null
);
create unique index fpl_teams_name_lower_key on public.fpl_teams (lower(name));

create table public.fpl_players (
  fpl_player_id integer primary key check (fpl_player_id > 0),
  web_name text not null check (btrim(web_name) <> ''),
  first_name text not null,
  second_name text not null,
  known_name text,
  canonical_name text not null check (btrim(canonical_name) <> ''),
  fpl_team_id integer not null references public.fpl_teams(fpl_team_id) on delete restrict,
  position public.fpl_position not null,
  current_price numeric(4,1) not null check (current_price >= 0),
  status text,
  can_select boolean not null,
  can_transact boolean not null,
  removed boolean not null,
  updated_at timestamptz not null
);
create index fpl_players_team_idx on public.fpl_players (fpl_team_id);
create index fpl_players_position_price_idx on public.fpl_players (position, current_price);
create index fpl_players_canonical_lower_idx on public.fpl_players (lower(canonical_name));
create index fpl_players_web_name_lower_idx on public.fpl_players (lower(web_name));

create table public.fpl_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status public.fpl_sync_status not null,
  player_count integer not null default 0 check (player_count >= 0),
  team_count integer not null default 0 check (team_count >= 0),
  error_message text,
  check ((status = 'RUNNING' and completed_at is null) or (status <> 'RUNNING' and completed_at is not null))
);
create index fpl_sync_runs_started_idx on public.fpl_sync_runs (started_at desc);

alter table public.entities add column fpl_match_status text not null default 'UNRESOLVED'
  check (fpl_match_status in ('UNRESOLVED', 'RESOLVED'));

create or replace function public.normalized_fpl_name(value text)
returns text language sql immutable parallel safe set search_path = ''
as $$ select regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '', 'g') $$;

create or replace function public.resolve_entity_fpl_identity()
returns trigger language plpgsql set search_path = '' as $$
declare matched_id integer; match_count integer;
begin
  if new.external_fpl_id is not null then
    if new.type = 'PLAYER' and exists (select 1 from public.fpl_players) and not exists (select 1 from public.fpl_players where fpl_player_id = new.external_fpl_id) then raise exception 'Unknown FPL player ID %', new.external_fpl_id; end if;
    if new.type = 'TEAM' and exists (select 1 from public.fpl_teams) and not exists (select 1 from public.fpl_teams where fpl_team_id = new.external_fpl_id) then raise exception 'Unknown FPL team ID %', new.external_fpl_id; end if;
    new.fpl_match_status := 'RESOLVED'; return new;
  end if;
  if new.type = 'PLAYER' then
    select count(*), min(p.fpl_player_id) into match_count, matched_id from public.fpl_players p
    where public.normalized_fpl_name(new.canonical_name) in (public.normalized_fpl_name(p.canonical_name), public.normalized_fpl_name(p.web_name), public.normalized_fpl_name(coalesce(p.known_name,'')), public.normalized_fpl_name(p.first_name || ' ' || p.second_name))
       or exists (select 1 from unnest(new.aliases) a where public.normalized_fpl_name(a) in (public.normalized_fpl_name(p.canonical_name), public.normalized_fpl_name(p.web_name), public.normalized_fpl_name(coalesce(p.known_name,'')), public.normalized_fpl_name(p.first_name || ' ' || p.second_name)));
  else
    select count(*), min(t.fpl_team_id) into match_count, matched_id from public.fpl_teams t
    where public.normalized_fpl_name(new.canonical_name) in (public.normalized_fpl_name(t.name), public.normalized_fpl_name(t.short_name))
       or exists (select 1 from unnest(new.aliases) a where public.normalized_fpl_name(a) in (public.normalized_fpl_name(t.name), public.normalized_fpl_name(t.short_name)));
  end if;
  if match_count = 1 then new.external_fpl_id := matched_id; new.fpl_match_status := 'RESOLVED'; else new.fpl_match_status := 'UNRESOLVED'; end if;
  return new;
end $$;
create trigger resolve_entity_fpl_identity_before_write before insert or update of canonical_name, aliases, external_fpl_id on public.entities for each row execute function public.resolve_entity_fpl_identity();

create or replace function public.reconcile_entities_with_fpl_registry()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  update public.entities e set aliases = e.aliases where e.external_fpl_id is null;
  get diagnostics affected = row_count;
  return affected;
end $$;

alter table public.fpl_teams enable row level security;
alter table public.fpl_players enable row level security;
alter table public.fpl_sync_runs enable row level security;
grant all on public.fpl_teams, public.fpl_players, public.fpl_sync_runs to service_role;
grant execute on function public.reconcile_entities_with_fpl_registry() to service_role;
