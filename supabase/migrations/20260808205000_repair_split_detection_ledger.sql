-- Repair hosted projects whose migration history records the split-detection
-- migration but whose ledger table is absent. This is intentionally a no-op
-- for fresh and already-correct databases.
create table if not exists public.split_detection_insights (
  insight_id uuid not null references public.insights(id) on delete restrict,
  detection_version text not null check (btrim(detection_version) <> ''),
  prompt_version text not null check (btrim(prompt_version) <> ''),
  detection_model text not null check (btrim(detection_model) <> ''),
  processing_run_id uuid references public.processing_runs(id) on delete restrict,
  detected_at timestamptz not null,
  primary key (insight_id, detection_version)
);

create index if not exists split_detection_insights_run_idx
  on public.split_detection_insights (processing_run_id);

alter table public.split_detection_insights enable row level security;
grant all on table public.split_detection_insights to service_role;
