create type public.source_platform as enum ('YOUTUBE', 'PODCAST');
create type public.processing_run_status as enum ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');
create type public.episode_processing_status as enum (
  'DISCOVERED',
  'TRANSCRIPT_FETCHING',
  'TRANSCRIPT_READY',
  'EXTRACTING',
  'COMPLETED',
  'FAILED'
);
create type public.transcript_processing_status as enum ('PENDING', 'FETCHING', 'READY', 'FAILED');
create type public.extraction_processing_status as enum ('PENDING', 'EXTRACTING', 'COMPLETED', 'FAILED');
create type public.entity_type as enum ('PLAYER', 'TEAM');
create type public.creator_confidence as enum ('LOW', 'MEDIUM', 'HIGH');
create type public.split_decision_status as enum ('OPEN', 'RESOLVED');

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  platform public.source_platform not null,
  channel_url text not null check (btrim(channel_url) <> ''),
  external_channel_id text not null check (btrim(external_channel_id) <> ''),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (platform, external_channel_id)
);

create table public.source_checkpoints (
  source_id uuid primary key references public.sources(id) on delete restrict,
  last_successful_published_at timestamptz,
  last_successful_episode_external_id text,
  last_checked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.processing_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status public.processing_run_status not null default 'RUNNING',
  sources_checked integer not null default 0 check (sources_checked >= 0),
  episodes_discovered integer not null default 0 check (episodes_discovered >= 0),
  episodes_processed integer not null default 0 check (episodes_processed >= 0),
  episodes_failed integer not null default 0 check (episodes_failed >= 0),
  error_message text,
  check (completed_at is null or completed_at >= started_at)
);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete restrict,
  external_episode_id text not null check (btrim(external_episode_id) <> ''),
  title text not null check (btrim(title) <> ''),
  source_url text not null check (btrim(source_url) <> ''),
  published_at timestamptz not null,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  gameweek smallint check (gameweek is null or gameweek between 1 and 38),
  created_at timestamptz not null default now(),
  unique (source_id, external_episode_id)
);

create table public.run_episodes (
  run_id uuid not null references public.processing_runs(id) on delete restrict,
  episode_id uuid not null references public.episodes(id) on delete restrict,
  status public.episode_processing_status not null default 'DISCOVERED',
  started_at timestamptz,
  completed_at timestamptz,
  transcript_status public.transcript_processing_status not null default 'PENDING',
  extraction_status public.extraction_processing_status not null default 'PENDING',
  error_message text,
  retry_count integer not null default 0 check (retry_count >= 0),
  primary key (run_id, episode_id),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete restrict,
  provider text not null check (btrim(provider) <> ''),
  raw_text text not null check (btrim(raw_text) <> ''),
  language text not null check (btrim(language) <> ''),
  fetched_at timestamptz not null default now(),
  content_hash text not null check (btrim(content_hash) <> ''),
  unique (episode_id, content_hash)
);

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  type public.entity_type not null,
  canonical_name text not null check (btrim(canonical_name) <> ''),
  external_fpl_id integer check (external_fpl_id is null or external_fpl_id > 0),
  aliases text[] not null default '{}',
  unique (type, canonical_name)
);

create unique index entities_type_external_fpl_id_key
  on public.entities (type, external_fpl_id)
  where external_fpl_id is not null;

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete restrict,
  claim text not null check (btrim(claim) <> ''),
  reasoning text not null check (btrim(reasoning) <> ''),
  primary_category text not null check (btrim(primary_category) <> ''),
  recommendation text not null check (btrim(recommendation) <> ''),
  time_horizon text not null check (btrim(time_horizon) <> ''),
  creator_confidence public.creator_confidence not null,
  valid_from_gameweek smallint check (valid_from_gameweek is null or valid_from_gameweek between 1 and 38),
  valid_to_gameweek smallint check (valid_to_gameweek is null or valid_to_gameweek between 1 and 38),
  evidence_text text,
  timestamp_seconds integer check (timestamp_seconds is null or timestamp_seconds >= 0),
  created_at timestamptz not null default now(),
  extraction_version text not null check (btrim(extraction_version) <> ''),
  check (
    valid_from_gameweek is null
    or valid_to_gameweek is null
    or valid_from_gameweek <= valid_to_gameweek
  )
);

create table public.insight_entities (
  insight_id uuid not null references public.insights(id) on delete restrict,
  entity_id uuid not null references public.entities(id) on delete restrict,
  role text not null check (btrim(role) <> ''),
  primary key (insight_id, entity_id, role)
);

create table public.split_decisions (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (btrim(subject) <> ''),
  question text not null check (btrim(question) <> ''),
  primary_category text not null check (btrim(primary_category) <> ''),
  time_horizon text not null check (btrim(time_horizon) <> ''),
  status public.split_decision_status not null default 'OPEN',
  unresolved_question text,
  implication text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.split_positions (
  id uuid primary key default gen_random_uuid(),
  split_decision_id uuid not null references public.split_decisions(id) on delete restrict,
  position text not null check (btrim(position) <> ''),
  reasoning text not null check (btrim(reasoning) <> ''),
  created_at timestamptz not null default now(),
  unique (split_decision_id, position)
);

create table public.split_position_insights (
  split_position_id uuid not null references public.split_positions(id) on delete restrict,
  insight_id uuid not null references public.insights(id) on delete restrict,
  primary key (split_position_id, insight_id)
);

create table public.run_summaries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.processing_runs(id) on delete restrict,
  summary_text text not null check (btrim(summary_text) <> ''),
  generated_at timestamptz not null default now(),
  prompt_version text not null check (btrim(prompt_version) <> ''),
  unique (run_id, prompt_version)
);

create index sources_enabled_idx on public.sources (enabled) where enabled;
create index processing_runs_started_at_idx on public.processing_runs (started_at desc);
create index processing_runs_status_idx on public.processing_runs (status);
create index episodes_source_published_at_idx on public.episodes (source_id, published_at desc);
create index episodes_published_at_idx on public.episodes (published_at desc);
create index run_episodes_episode_id_idx on public.run_episodes (episode_id);
create index run_episodes_status_idx on public.run_episodes (status);
create index transcripts_episode_fetched_at_idx on public.transcripts (episode_id, fetched_at desc);
create index insights_episode_created_at_idx on public.insights (episode_id, created_at);
create index insights_category_idx on public.insights (primary_category);
create index insight_entities_entity_id_idx on public.insight_entities (entity_id);
create index split_decisions_status_idx on public.split_decisions (status);
create index split_positions_decision_id_idx on public.split_positions (split_decision_id);
create index split_position_insights_insight_id_idx on public.split_position_insights (insight_id);
create index run_summaries_run_id_idx on public.run_summaries (run_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger source_checkpoints_set_updated_at
before update on public.source_checkpoints
for each row execute function public.set_updated_at();

create trigger split_decisions_set_updated_at
before update on public.split_decisions
for each row execute function public.set_updated_at();

alter table public.sources enable row level security;
alter table public.source_checkpoints enable row level security;
alter table public.processing_runs enable row level security;
alter table public.episodes enable row level security;
alter table public.run_episodes enable row level security;
alter table public.transcripts enable row level security;
alter table public.entities enable row level security;
alter table public.insights enable row level security;
alter table public.insight_entities enable row level security;
alter table public.split_decisions enable row level security;
alter table public.split_positions enable row level security;
alter table public.split_position_insights enable row level security;
alter table public.run_summaries enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table
  public.sources,
  public.source_checkpoints,
  public.processing_runs,
  public.episodes,
  public.run_episodes,
  public.transcripts,
  public.entities,
  public.insights,
  public.insight_entities,
  public.split_decisions,
  public.split_positions,
  public.split_position_insights,
  public.run_summaries
to service_role;

