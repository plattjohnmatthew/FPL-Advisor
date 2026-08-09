alter table public.processing_runs
  add column discovery_start timestamptz,
  add column discovery_end timestamptz,
  add column youtube_max_videos_per_creator integer,
  add column episodes_selected integer not null default 0 check (episodes_selected >= 0),
  add column episodes_deferred integer not null default 0 check (episodes_deferred >= 0),
  add constraint processing_runs_discovery_window_valid check (
    (discovery_start is null and discovery_end is null)
    or (discovery_start is not null and discovery_end is not null and discovery_start < discovery_end)
  ),
  add constraint processing_runs_youtube_limit_valid check (
    youtube_max_videos_per_creator is null
    or youtube_max_videos_per_creator between 1 and 20
  );

comment on column public.processing_runs.discovery_end is
  'Exclusive UTC upper boundary derived from the user-selected local end date.';
