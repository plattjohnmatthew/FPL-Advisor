create table public.fpl_selected_entry (
  singleton boolean primary key default true check (singleton),
  entry_id bigint not null check (entry_id > 0),
  updated_at timestamptz not null default now()
);

insert into public.fpl_selected_entry(singleton, entry_id)
select true, snapshot.entry_id
from public.fpl_squad_snapshots snapshot
order by snapshot.retrieved_at desc, snapshot.created_at desc
limit 1
on conflict (singleton) do nothing;

create trigger set_fpl_selected_entry_updated_at
before update on public.fpl_selected_entry
for each row execute function public.set_updated_at();

alter table public.fpl_selected_entry enable row level security;
revoke all on public.fpl_selected_entry from anon, authenticated;
grant select, insert, update on public.fpl_selected_entry to service_role;

-- Authoritative FPL identity wins for an exact unresolved canonical entity.
update public.entities entity
set external_fpl_id = player.fpl_player_id, fpl_match_status = 'RESOLVED'
from public.fpl_players player
where entity.type = 'PLAYER'
  and entity.external_fpl_id is null
  and lower(entity.canonical_name) = lower(player.canonical_name)
  and not exists (
    select 1 from public.entities owner
    where owner.type = 'PLAYER' and owner.external_fpl_id = player.fpl_player_id
  );

-- Ensure every player in the currently selected squad has an explorer identity.
with latest as (
  select snapshot.id
  from public.fpl_squad_snapshots snapshot
  join public.fpl_selected_entry selected on selected.entry_id = snapshot.entry_id
  order by snapshot.gameweek desc, snapshot.retrieved_at desc
  limit 1
)
insert into public.entities(type, canonical_name, external_fpl_id, aliases, fpl_match_status)
select 'PLAYER', player.canonical_name, player.fpl_player_id,
  case when player.web_name = player.canonical_name then '{}'::text[] else array[player.web_name] end,
  'RESOLVED'
from latest
join public.fpl_squad_picks pick on pick.snapshot_id = latest.id
join public.fpl_players player on player.fpl_player_id = pick.fpl_player_id
where not exists (
  select 1 from public.entities entity
  where entity.type = 'PLAYER' and entity.external_fpl_id = player.fpl_player_id
)
on conflict (type, canonical_name) do nothing;

create index if not exists fpl_squad_picks_snapshot_position_idx
  on public.fpl_squad_picks (snapshot_id, squad_position);
