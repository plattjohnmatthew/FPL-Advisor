alter table public.fpl_players
  add column event_price_change numeric(4,1) not null default 0,
  add column start_price_change numeric(4,1) not null default 0,
  add column transfers_in bigint not null default 0 check (transfers_in >= 0),
  add column transfers_out bigint not null default 0 check (transfers_out >= 0),
  add column transfers_in_event bigint not null default 0 check (transfers_in_event >= 0),
  add column transfers_out_event bigint not null default 0 check (transfers_out_event >= 0);

create table public.fpl_player_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  fpl_player_id integer not null references public.fpl_players(fpl_player_id) on delete restrict,
  sync_run_id uuid not null references public.fpl_sync_runs(id) on delete restrict,
  price numeric(4,1) not null check (price >= 0),
  observed_at timestamptz not null,
  event_id integer check (event_id is null or event_id between 1 and 38),
  source text not null check (source in ('OFFICIAL_BOOTSTRAP')),
  created_at timestamptz not null default now(),
  unique (sync_run_id, fpl_player_id)
);

create index fpl_price_snapshots_player_observed_idx on public.fpl_player_price_snapshots (fpl_player_id, observed_at desc);
create index fpl_price_snapshots_event_idx on public.fpl_player_price_snapshots (event_id, observed_at desc) where event_id is not null;
create index fpl_price_snapshots_price_idx on public.fpl_player_price_snapshots (price);

alter table public.fpl_player_price_snapshots enable row level security;
grant all on public.fpl_player_price_snapshots to service_role;
