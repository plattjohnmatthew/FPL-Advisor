insert into public.sources (id, name, platform, channel_url, external_channel_id)
values
  ('00000000-0000-4000-8000-000000000001', 'FPL Forecast Lab', 'YOUTUBE', 'https://example.com/fpl-forecast-lab', 'seed-fpl-forecast-lab'),
  ('00000000-0000-4000-8000-000000000002', 'Green Arrow Podcast', 'PODCAST', 'https://example.com/green-arrow-podcast', 'seed-green-arrow-podcast'),
  ('00000000-0000-4000-8000-000000000003', 'Deadline Tactics', 'YOUTUBE', 'https://example.com/deadline-tactics', 'seed-deadline-tactics'),
  ('00000000-0000-4000-8000-000000000010', 'Let''s Talk FPL', 'YOUTUBE', 'https://www.youtube.com/@LetsTalkFPL', 'UCxeOc7eFxq37yW_Nc-69deA'),
  ('00000000-0000-4000-8000-000000000011', 'The FPL Wire', 'YOUTUBE', 'https://www.youtube.com/@TheFPLWire', 'UCtIPFexB6PLKNNl0XH3SKKw')
on conflict do nothing;

update public.sources set enabled = false where id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
);

insert into public.source_checkpoints (
  source_id,
  last_successful_published_at,
  last_successful_episode_external_id,
  last_checked_at
)
values
  ('00000000-0000-4000-8000-000000000001', null, null, null),
  ('00000000-0000-4000-8000-000000000002', null, null, null),
  ('00000000-0000-4000-8000-000000000003', '2026-08-07T20:00:00Z', 'seed-episode-deadline-1', '2026-08-08T08:00:00Z')
on conflict do nothing;

insert into public.source_checkpoints (source_id)
select id from public.sources
where external_channel_id in ('UCxeOc7eFxq37yW_Nc-69deA', 'UCtIPFexB6PLKNNl0XH3SKKw')
on conflict do nothing;

insert into public.processing_runs (
  id,
  started_at,
  completed_at,
  status,
  sources_checked,
  episodes_discovered,
  episodes_processed,
  episodes_failed
)
values (
  '10000000-0000-4000-8000-000000000001',
  '2026-08-08T08:00:00Z',
  '2026-08-08T08:08:00Z',
  'COMPLETED',
  3,
  4,
  4,
  0
)
on conflict do nothing;

insert into public.episodes (
  id,
  source_id,
  external_episode_id,
  title,
  source_url,
  published_at,
  duration_seconds,
  gameweek
)
values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'seed-episode-forecast-1', 'Gameweek 1 Draft Decisions', 'https://example.com/fpl-forecast-lab/gw1', '2026-08-06T18:00:00Z', 3600, 1),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'seed-episode-arrow-1', 'Premium Midfielders Compared', 'https://example.com/green-arrow-podcast/premiums', '2026-08-07T07:00:00Z', 2700, 1),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'seed-episode-deadline-1', 'Opening Fixtures Deep Dive', 'https://example.com/deadline-tactics/fixtures', '2026-08-07T20:00:00Z', 4200, 1),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'seed-episode-forecast-2', 'Final Team Selection', 'https://example.com/fpl-forecast-lab/final-team', '2026-08-08T07:00:00Z', 3300, 1)
on conflict do nothing;

insert into public.run_episodes (
  run_id,
  episode_id,
  status,
  started_at,
  completed_at,
  transcript_status,
  extraction_status
)
select
  '10000000-0000-4000-8000-000000000001',
  id,
  'COMPLETED',
  '2026-08-08T08:01:00Z',
  '2026-08-08T08:07:00Z',
  'READY',
  'COMPLETED'
from public.episodes
where id in (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000004'
)
on conflict do nothing;

insert into public.transcripts (id, episode_id, provider, raw_text, language, fetched_at, content_hash)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'seed', 'The creator prefers Salah because captaincy raises his effective value.', 'en', '2026-08-08T08:02:00Z', 'seed-hash-wire-1'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'seed', 'The creator prefers spreading funds and starting with Saka.', 'en', '2026-08-08T08:02:00Z', 'seed-hash-planet-1'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'seed', 'Arsenal have the strongest opening defensive fixtures.', 'en', '2026-08-08T08:03:00Z', 'seed-hash-blackbox-1')
on conflict do nothing;

insert into public.entities (id, type, canonical_name, external_fpl_id, aliases)
values
  ('40000000-0000-4000-8000-000000000001', 'PLAYER', 'Mohamed Salah', 101, array['Salah', 'Mo Salah']),
  ('40000000-0000-4000-8000-000000000002', 'PLAYER', 'Bukayo Saka', 102, array['Saka']),
  ('40000000-0000-4000-8000-000000000003', 'TEAM', 'Arsenal', 1, array['ARS'])
on conflict do nothing;

insert into public.insights (
  id,
  episode_id,
  claim,
  reasoning,
  primary_category,
  recommendation,
  time_horizon,
  creator_confidence,
  valid_from_gameweek,
  valid_to_gameweek,
  evidence_text,
  timestamp_seconds,
  extraction_version
)
values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Salah is worth the premium for Gameweek 1.', 'His captaincy ceiling offsets the reduced budget elsewhere.', 'SQUAD_STRUCTURE', 'BUY', 'SHORT', 'HIGH', 1, 3, 'Captaincy raises his effective value.', 840, 'seed-v1'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Saka enables a better-balanced opening squad.', 'The saving funds upgrades across two weaker positions.', 'SQUAD_STRUCTURE', 'BUY', 'SHORT', 'MEDIUM', 1, 3, 'Prefer spreading funds and starting with Saka.', 1120, 'seed-v1'),
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'Arsenal defenders are strong early picks.', 'Their opening fixtures offer clean-sheet potential.', 'FIXTURES', 'BUY', 'SHORT', 'HIGH', 1, 5, 'Arsenal have the strongest opening defensive fixtures.', 630, 'seed-v1')
on conflict do nothing;

insert into public.insight_entities (insight_id, entity_id, role)
values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'SUBJECT'),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'SUBJECT'),
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', 'SUBJECT')
on conflict do nothing;

insert into public.split_decisions (
  id,
  subject,
  question,
  primary_category,
  time_horizon,
  status,
  unresolved_question,
  implication,
  decision_key,
  detection_version,
  prompt_version,
  detection_model,
  last_detected_at
)
values (
  '60000000-0000-4000-8000-000000000001',
  'Salah versus Saka squad structure',
  'Should managers pay for Salah or use Saka to spread funds?',
  'SQUAD_STRUCTURE',
  'SHORT',
  'OPEN',
  'Will Salah receive enough captaincy to justify the price gap?',
  'The decision changes the available budget across the rest of the squad.',
  'salah-versus-saka-squad-structure',
  'seed-v1',
  'seed-prompt-v1',
  'seed-model',
  '2026-08-08T08:08:00Z'
)
on conflict do nothing;

insert into public.split_positions (id, split_decision_id, position, reasoning, position_key)
values
  ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'Pay for Salah', 'Captaincy and explosive returns justify concentrating budget.', 'pay-for-salah'),
  ('61000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', 'Choose Saka and spread funds', 'A cheaper premium improves multiple starting positions.', 'choose-saka-and-spread-funds')
on conflict do nothing;

insert into public.split_position_insights (split_position_id, insight_id)
values
  ('61000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002')
on conflict do nothing;

insert into public.run_summaries (id, run_id, summary_text, summary_data, generated_at, prompt_version, model)
values (
  '70000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Creators disagree on premium structure, while one creator favours Arsenal defensive investment.',
  '{"overview":"Creators disagree on premium structure, while one creator favours Arsenal defensive investment.","overviewInterpretation":"DISAGREEMENT","overviewSupportingInsightIds":["50000000-0000-4000-8000-000000000001","50000000-0000-4000-8000-000000000002","50000000-0000-4000-8000-000000000003"],"sections":{"keyDevelopments":[{"statement":"Creators present competing premium squad structures.","interpretation":"DISAGREEMENT","supportingInsightIds":["50000000-0000-4000-8000-000000000001","50000000-0000-4000-8000-000000000002"]}],"strongestTransferRecommendations":[],"negativePlayers":[],"captaincy":[],"fixtureDevelopments":[{"statement":"One creator considers Arsenal defenders strong early picks.","interpretation":"CREATOR_CLAIM","supportingInsightIds":["50000000-0000-4000-8000-000000000003"]}],"minutesInjuriesRotation":[],"priceValue":[],"chipsWildcard":[]},"splitDecisionIds":["60000000-0000-4000-8000-000000000001"]}'::jsonb,
  '2026-08-08T08:08:00Z',
  'seed-v1',
  'seed-model'
)
on conflict do nothing;
