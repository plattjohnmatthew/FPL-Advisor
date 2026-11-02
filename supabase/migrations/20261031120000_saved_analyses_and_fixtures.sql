create table public.research_analyses (
  id uuid primary key default gen_random_uuid(),
  context_mode text not null check (context_mode in ('GLOBAL', 'MY_TEAM')),
  question text not null check (char_length(btrim(question)) between 3 and 1000),
  normalized_question text not null check (btrim(normalized_question) <> ''),
  scope_preset text not null check (scope_preset in ('THIS_WEEK', 'LAST_7_DAYS', 'LAST_14_DAYS', 'LAST_30_DAYS', 'THIS_SEASON', 'ALL_HISTORY', 'CUSTOM')),
  scope_label text not null check (btrim(scope_label) <> ''),
  date_from timestamptz,
  date_to timestamptz,
  query_fingerprint text not null check (btrim(query_fingerprint) <> ''),
  evidence_fingerprint text not null check (btrim(evidence_fingerprint) <> ''),
  response_data jsonb not null check (jsonb_typeof(response_data) = 'object'),
  cited_insight_ids uuid[] not null default '{}',
  source_episode_ids uuid[] not null default '{}',
  query_model text not null check (btrim(query_model) <> ''),
  answer_model text,
  created_at timestamptz not null default now(),
  reuse_count integer not null default 0 check (reuse_count >= 0),
  last_reused_at timestamptz
);
create index research_analyses_scope_idx on public.research_analyses (context_mode, date_from, date_to, created_at desc);
create index research_analyses_fingerprint_idx on public.research_analyses (evidence_fingerprint, created_at desc);
create index research_analyses_query_fingerprint_idx on public.research_analyses (query_fingerprint, created_at desc);
create index research_analyses_question_idx on public.research_analyses (normalized_question);

alter table public.research_analyses enable row level security;
grant all on public.research_analyses to service_role;

create table public.fpl_fixtures (
  fpl_fixture_id integer primary key check (fpl_fixture_id > 0),
  event_id integer check (event_id between 1 and 38),
  kickoff_time timestamptz,
  home_team_id integer not null references public.fpl_teams(fpl_team_id) on delete restrict,
  away_team_id integer not null references public.fpl_teams(fpl_team_id) on delete restrict,
  home_difficulty integer not null check (home_difficulty between 1 and 5),
  away_difficulty integer not null check (away_difficulty between 1 and 5),
  finished boolean not null,
  started boolean not null,
  source text not null default 'OFFICIAL_FPL_FIXTURES' check (btrim(source) <> ''),
  sync_run_id uuid not null references public.fpl_sync_runs(id) on delete restrict,
  updated_at timestamptz not null,
  check (home_team_id <> away_team_id)
);
create index fpl_fixtures_event_idx on public.fpl_fixtures (event_id, kickoff_time);
create index fpl_fixtures_home_idx on public.fpl_fixtures (home_team_id, event_id);
create index fpl_fixtures_away_idx on public.fpl_fixtures (away_team_id, event_id);

alter table public.fpl_fixtures enable row level security;
grant all on public.fpl_fixtures to service_role;
