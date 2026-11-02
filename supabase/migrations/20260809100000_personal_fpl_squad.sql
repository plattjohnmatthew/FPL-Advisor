create table public.fpl_squad_snapshots (
  id uuid primary key default gen_random_uuid(),
  entry_id bigint not null check (entry_id > 0),
  entry_name text not null check (btrim(entry_name) <> ''),
  manager_name text not null,
  gameweek integer not null check (gameweek between 1 and 38),
  retrieved_at timestamptz not null,
  event_points integer,
  total_points integer,
  overall_rank bigint,
  active_chip text,
  picks_hash text not null check (length(picks_hash) = 64),
  source text not null check (source = 'OFFICIAL_PUBLIC_ENTRY_API'),
  created_at timestamptz not null default now(),
  unique (entry_id, gameweek, picks_hash)
);

create table public.fpl_squad_picks (
  snapshot_id uuid not null references public.fpl_squad_snapshots(id) on delete restrict,
  fpl_player_id integer not null references public.fpl_players(fpl_player_id) on delete restrict,
  squad_position integer not null check (squad_position between 1 and 15),
  multiplier integer not null check (multiplier >= 0),
  is_captain boolean not null,
  is_vice_captain boolean not null,
  bench_order integer check (bench_order is null or bench_order between 1 and 4),
  primary key (snapshot_id, fpl_player_id),
  unique (snapshot_id, squad_position),
  check ((squad_position <= 11 and bench_order is null) or (squad_position > 11 and bench_order = squad_position - 11)),
  check (not (is_captain and is_vice_captain))
);

create table public.fpl_squad_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  entry_id bigint not null check (entry_id > 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('RUNNING','COMPLETED','UNAVAILABLE','FAILED')),
  snapshot_id uuid references public.fpl_squad_snapshots(id) on delete restrict,
  error_message text,
  availability_message text,
  check ((status = 'RUNNING' and completed_at is null) or (status <> 'RUNNING' and completed_at is not null)),
  check ((status = 'COMPLETED' and snapshot_id is not null) or (status <> 'COMPLETED' and snapshot_id is null))
);

create index fpl_squad_snapshots_entry_latest_idx on public.fpl_squad_snapshots (entry_id, gameweek desc, retrieved_at desc);
create index fpl_squad_picks_player_idx on public.fpl_squad_picks (fpl_player_id);
create index fpl_squad_refresh_runs_entry_latest_idx on public.fpl_squad_refresh_runs (entry_id, started_at desc);

create or replace function public.persist_fpl_squad_snapshot(
  target_refresh_run_id uuid, target_entry_id bigint, target_entry_name text, target_manager_name text,
  target_gameweek integer, target_retrieved_at timestamptz, target_event_points integer,
  target_total_points integer, target_overall_rank bigint, target_active_chip text,
  target_picks_hash text, target_picks jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare snapshot uuid; pick jsonb;
begin
  if jsonb_typeof(target_picks) <> 'array' or jsonb_array_length(target_picks) <> 15 then raise exception 'FPL squad must contain exactly 15 picks'; end if;
  if (select count(distinct (item->>'fplPlayerId')::integer) from jsonb_array_elements(target_picks) item) <> 15 then raise exception 'FPL squad player IDs must be unique'; end if;
  if (select count(distinct (item->>'squadPosition')::integer) from jsonb_array_elements(target_picks) item) <> 15 then raise exception 'FPL squad positions must be unique'; end if;
  if (select count(*) from jsonb_array_elements(target_picks) item where (item->>'isCaptain')::boolean) <> 1 then raise exception 'FPL squad must contain exactly one captain'; end if;
  if (select count(*) from jsonb_array_elements(target_picks) item where (item->>'isViceCaptain')::boolean) <> 1 then raise exception 'FPL squad must contain exactly one vice captain'; end if;
  if exists (select 1 from jsonb_array_elements(target_picks) item where not exists (select 1 from public.fpl_players p where p.fpl_player_id=(item->>'fplPlayerId')::integer)) then raise exception 'FPL squad contains an unknown canonical player ID'; end if;

  insert into public.fpl_squad_snapshots(entry_id,entry_name,manager_name,gameweek,retrieved_at,event_points,total_points,overall_rank,active_chip,picks_hash,source)
  values(target_entry_id,target_entry_name,target_manager_name,target_gameweek,target_retrieved_at,target_event_points,target_total_points,target_overall_rank,target_active_chip,target_picks_hash,'OFFICIAL_PUBLIC_ENTRY_API')
  on conflict (entry_id,gameweek,picks_hash) do update set retrieved_at=excluded.retrieved_at,event_points=excluded.event_points,total_points=excluded.total_points,overall_rank=excluded.overall_rank,active_chip=excluded.active_chip
  returning id into snapshot;

  for pick in select value from jsonb_array_elements(target_picks) loop
    insert into public.fpl_squad_picks(snapshot_id,fpl_player_id,squad_position,multiplier,is_captain,is_vice_captain,bench_order)
    values(snapshot,(pick->>'fplPlayerId')::integer,(pick->>'squadPosition')::integer,(pick->>'multiplier')::integer,(pick->>'isCaptain')::boolean,(pick->>'isViceCaptain')::boolean,nullif(pick->>'benchOrder','')::integer)
    on conflict (snapshot_id,fpl_player_id) do update set squad_position=excluded.squad_position,multiplier=excluded.multiplier,is_captain=excluded.is_captain,is_vice_captain=excluded.is_vice_captain,bench_order=excluded.bench_order;
  end loop;
  update public.fpl_squad_refresh_runs set status='COMPLETED',completed_at=now(),snapshot_id=snapshot,error_message=null where id=target_refresh_run_id and entry_id=target_entry_id;
  if not found then raise exception 'FPL squad refresh run not found'; end if;
  return snapshot;
end $$;

alter table public.fpl_squad_snapshots enable row level security;
alter table public.fpl_squad_picks enable row level security;
alter table public.fpl_squad_refresh_runs enable row level security;
grant all on public.fpl_squad_snapshots, public.fpl_squad_picks, public.fpl_squad_refresh_runs to service_role;
grant execute on function public.persist_fpl_squad_snapshot(uuid,bigint,text,text,integer,timestamptz,integer,integer,bigint,text,text,jsonb) to service_role;
