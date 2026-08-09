\ir demo-fixture.inc

begin;

create extension if not exists pgtap with schema extensions;

select plan(70);

select has_table('public', 'sources', 'sources table exists');
select has_table('public', 'source_checkpoints', 'source_checkpoints table exists');
select has_table('public', 'processing_runs', 'processing_runs table exists');
select has_table('public', 'episodes', 'episodes table exists');
select has_table('public', 'transcripts', 'transcripts table exists');
select has_table('public', 'entities', 'entities table exists');
select has_table('public', 'insights', 'insights table exists');
select has_table('public', 'episode_extractions', 'episode extraction audit table exists');
select has_table('public', 'split_detection_insights', 'split detection ledger exists');
select has_table('public', 'processing_failures', 'structured processing failures table exists');
select has_function('public', 'load_split_detection_context', array['uuid','text','integer','integer'], 'split context is loaded by scalar run parameters');
select has_column('public', 'split_decisions', 'decision_key', 'split decisions have stable idempotency keys');
select has_column('public', 'run_summaries', 'summary_data', 'run summaries store validated structured reports');
select has_column('public', 'run_summaries', 'model', 'run summaries audit the synthesis model');
select has_column('public', 'run_summaries', 'eligible_episode_count', 'run summaries retain eligible episode counts');
select has_column('public', 'run_summaries', 'included_episode_count', 'run summaries retain included episode counts');
select has_column('public', 'run_summaries', 'excluded_episodes', 'run summaries retain excluded episodes and reasons');
select has_column('public', 'run_summaries', 'distinct_creator_count', 'run summaries retain distinct creator counts');
select has_column('public', 'processing_runs', 'discovery_start', 'runs retain discovery start');
select has_column('public', 'processing_runs', 'discovery_end', 'runs retain discovery end');
select has_column('public', 'processing_runs', 'youtube_max_videos_per_creator', 'runs retain YouTube creator limit');
select has_column('public', 'processing_runs', 'episodes_selected', 'runs retain selected count');
select has_column('public', 'processing_runs', 'episodes_deferred', 'runs retain deferred count');
select throws_ok(
  $$ insert into public.processing_runs (discovery_start, discovery_end, youtube_max_videos_per_creator) values ('2026-08-08', '2026-08-01', 21) $$,
  '23514', null, 'invalid persisted run scope is rejected'
);
select has_function('public', 'search_fpl_insights', array['text[]','text[]','text[]','text[]','timestamp with time zone','timestamp with time zone','integer[]','text[]','integer','boolean','boolean','boolean'], 'historical insight search function exists');
select has_function('public', 'search_fpl_split_decisions', array['uuid[]','text[]','boolean','integer'], 'split decision search function exists');

select results_eq(
  $$ select count(*)::bigint from public.sources $$,
  $$ values (5::bigint) $$,
  'seed loads fixture and predefined sources separately'
);

select results_eq(
  $$ select count(*)::bigint from public.sources where enabled $$,
  $$ values (2::bigint) $$,
  'exactly two predefined real sources are enabled'
);

select results_eq(
  $$ select external_channel_id from public.sources where enabled order by external_channel_id $$,
  $$ values ('UCtIPFexB6PLKNNl0XH3SKKw'::text), ('UCxeOc7eFxq37yW_Nc-69deA'::text) $$,
  'enabled sources use immutable real YouTube channel IDs'
);

select results_eq(
  $$ select count(*)::bigint from public.sources where enabled and platform = 'YOUTUBE' $$,
  $$ values (2::bigint) $$,
  'predefined discovery sources use the supported YouTube platform'
);

select results_eq(
  $$ select count(*)::bigint from public.source_checkpoints sc join public.sources s on s.id = sc.source_id where s.enabled and s.external_channel_id in ('UCxeOc7eFxq37yW_Nc-69deA','UCtIPFexB6PLKNNl0XH3SKKw') and sc.last_successful_published_at is null and sc.last_successful_episode_external_id is null $$,
  $$ values (2::bigint) $$,
  'real source checkpoints start empty for initial discovery'
);

select throws_ok(
  $$
    insert into public.episodes (
      source_id,
      external_episode_id,
      title,
      source_url,
      published_at
    ) values (
      '00000000-0000-4000-8000-000000000001',
      'seed-episode-forecast-1',
      'Duplicate episode',
      'https://example.com/duplicate',
      now()
    )
  $$,
  '23505',
  null,
  'duplicate source and external episode ID is rejected'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.split_decisions sd
    join public.split_positions sp on sp.split_decision_id = sd.id
    join public.split_position_insights spi on spi.split_position_id = sp.id
    join public.insights i on i.id = spi.insight_id
    join public.insight_entities ie on ie.insight_id = i.id
    join public.entities e on e.id = ie.entity_id
    where sd.id = '60000000-0000-4000-8000-000000000001'
  $$,
  $$ values (2::bigint) $$,
  'split positions retain insight and entity provenance'
);

insert into public.processing_runs (id, status)
values ('80000000-0000-4000-8000-000000000001', 'RUNNING');

select throws_ok(
  $$
    insert into public.processing_runs (id, status)
    values ('80000000-0000-4000-8000-000000000002', 'RUNNING')
  $$,
  '23505',
  null,
  'only one processing run can be running'
);

select throws_ok(
  $$
    update public.run_episodes
    set status = 'EXTRACTING'
    where run_id = '10000000-0000-4000-8000-000000000001'
      and episode_id = '20000000-0000-4000-8000-000000000001'
  $$,
  'P0001',
  null,
  'completed episodes cannot move backwards'
);

insert into public.episodes (id, source_id, external_episode_id, title, source_url, published_at)
values ('82000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'completion-guard', 'Completion guard', 'https://example.com/completion-guard', now());
insert into public.run_episodes (run_id, episode_id, status, transcript_status, extraction_status)
values ('10000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'EXTRACTING', 'READY', 'EXTRACTING');
select throws_ok(
  $$ update public.run_episodes set status = 'COMPLETED', extraction_status = 'COMPLETED' where episode_id = '82000000-0000-4000-8000-000000000001' $$,
  'P0001', null, 'episode cannot complete before durable transcript extraction audit and insights'
);

select has_column('public', 'insights', 'tags', 'insights store useful tags');
select has_column('public', 'insights', 'extraction_model', 'insights track the model used');
select has_column('public', 'insights', 'prompt_version', 'insights track the prompt version');

select results_eq(
  $$ select public.persist_episode_insight_extraction(
    '20000000-0000-4000-8000-000000000004', 'test-v1', 'prompt-v1', 'fake-model', 1200, 300, 1500, '2026-08-08T12:00:00Z',
    '[{"claim":"Buy Saka","reasoning":"Strong role","primaryCategory":"TRANSFER_DECISION","recommendation":"BUY","timeHorizon":"SHORT","creatorConfidence":"HIGH","validFromGameweek":null,"validToGameweek":null,"evidenceText":"I would buy Saka","timestampSeconds":60,"tags":["buy"],"entities":[{"type":"PLAYER","canonicalName":"Bukayo Saka","aliases":["Saka"],"role":"SUBJECT"},{"type":"TEAM","canonicalName":"Chelsea","aliases":["CFC"],"role":"OPPONENT"}]}]'::jsonb
  ) $$,
  $$ values (1) $$,
  'validated extraction is persisted atomically'
);

select results_eq(
  $$ select count(*)::bigint from public.insights where episode_id = '20000000-0000-4000-8000-000000000004' and extraction_version = 'test-v1' $$,
  $$ values (1::bigint) $$,
  'one insight links to its episode'
);

select results_eq(
  $$ select count(*)::bigint from public.insight_entities ie join public.insights i on i.id = ie.insight_id where i.episode_id = '20000000-0000-4000-8000-000000000004' and i.extraction_version = 'test-v1' $$,
  $$ values (2::bigint) $$,
  'insight entities and roles are linked'
);

select results_eq(
  $$ select model, input_tokens, output_tokens, total_tokens from public.episode_extractions where episode_id = '20000000-0000-4000-8000-000000000004' and extraction_version = 'test-v1' $$,
  $$ values ('fake-model'::text, 1200, 300, 1500) $$,
  'model and token usage are persisted per episode extraction'
);

select results_eq(
  $$ select extracted_at from public.episode_extractions where episode_id = '20000000-0000-4000-8000-000000000004' and extraction_version = 'test-v1' $$,
  $$ values ('2026-08-08T12:00:00Z'::timestamptz) $$,
  'extraction timestamp is persisted'
);

select results_eq(
  $$ select public.persist_episode_insight_extraction(
    '20000000-0000-4000-8000-000000000004', 'test-v1', 'prompt-v1', 'fake-model', 1200, 300, 1500, '2026-08-08T12:00:00Z', '[]'::jsonb
  ) $$,
  $$ values (0) $$,
  'retry does not duplicate an extraction version'
);

select throws_ok(
  $$ select public.persist_episode_insight_extraction(
    '20000000-0000-4000-8000-000000000004', 'malformed-v1', 'prompt-v1', 'fake-model', 100, 20, 120, '2026-08-08T12:00:00Z',
    '[{"claim":"Valid first row","reasoning":"Would otherwise insert","primaryCategory":"TRANSFER_DECISION","recommendation":"BUY","timeHorizon":"SHORT","creatorConfidence":"HIGH","validFromGameweek":null,"validToGameweek":null,"evidenceText":"evidence","timestampSeconds":null,"tags":[],"entities":[]},{"claim":"Invalid second row","reasoning":"Invalid enum","primaryCategory":"TRANSFER_DECISION","recommendation":"BUY","timeHorizon":"SHORT","creatorConfidence":"CERTAIN","validFromGameweek":null,"validToGameweek":null,"evidenceText":"evidence","timestampSeconds":null,"tags":[],"entities":[]}]'::jsonb
  ) $$,
  '22P02',
  null,
  'malformed extraction causes the whole transaction to fail'
);

select results_eq(
  $$ select count(*)::bigint from public.insights where episode_id = '20000000-0000-4000-8000-000000000004' and extraction_version = 'malformed-v1' $$,
  $$ values (0::bigint) $$,
  'malformed extraction leaves no partial insights'
);

select results_eq(
  $$ select count(*)::bigint from public.episode_extractions where episode_id = '20000000-0000-4000-8000-000000000004' and extraction_version = 'malformed-v1' $$,
  $$ values (0::bigint) $$,
  'malformed extraction leaves no usage audit record'
);

select results_eq(
  $$ select public.persist_split_decisions(
    '10000000-0000-4000-8000-000000000001', 'test-splits-v1', 'test-prompt-v1', 'fake-model', '2026-08-08T12:00:00Z',
    '["50000000-0000-4000-8000-000000000001","50000000-0000-4000-8000-000000000002"]'::jsonb,
    '[{"decisionKey":"salah-or-saka-test","subject":"Salah versus Saka","question":"Choose Salah or Saka?","primaryCategory":"SQUAD_STRUCTURE","timeHorizon":"SHORT","unresolvedQuestion":"Which structure scores more?","implication":"Changes budget allocation.","positions":[{"positionKey":"choose-salah","position":"CHOOSE SALAH","reasoning":"Captaincy","supportingInsightIds":["50000000-0000-4000-8000-000000000001"]},{"positionKey":"choose-saka","position":"CHOOSE SAKA","reasoning":"Balance","supportingInsightIds":["50000000-0000-4000-8000-000000000002"]}]}]'::jsonb
  ) $$,
  $$ values (1) $$,
  'split decision and positions persist atomically'
);

select results_eq(
  $$ select count(*)::bigint from public.split_position_insights spi join public.split_positions sp on sp.id = spi.split_position_id join public.split_decisions sd on sd.id = sp.split_decision_id where sd.decision_key = 'salah-or-saka-test' $$,
  $$ values (2::bigint) $$,
  'every detected position links to source insights'
);

select results_eq(
  $$ select count(*)::bigint from public.split_detection_insights where detection_version = 'test-splits-v1' $$,
  $$ values (2::bigint) $$,
  'evaluated insights are recorded even independently of split links'
);

select results_eq(
  $$ select public.persist_split_decisions(
    '10000000-0000-4000-8000-000000000001', 'test-splits-v1', 'test-prompt-v1', 'fake-model', '2026-08-08T12:01:00Z',
    '["50000000-0000-4000-8000-000000000001","50000000-0000-4000-8000-000000000002"]'::jsonb,
    '[{"decisionKey":"salah-or-saka-test","subject":"Salah versus Saka","question":"Choose Salah or Saka?","primaryCategory":"SQUAD_STRUCTURE","timeHorizon":"SHORT","unresolvedQuestion":"Which structure scores more?","implication":"Changes budget allocation.","positions":[{"positionKey":"choose-salah","position":"CHOOSE SALAH","reasoning":"Captaincy","supportingInsightIds":["50000000-0000-4000-8000-000000000001"]},{"positionKey":"choose-saka","position":"CHOOSE SAKA","reasoning":"Balance","supportingInsightIds":["50000000-0000-4000-8000-000000000002"]}]}]'::jsonb
  ) $$,
  $$ values (1) $$,
  'retry upserts the same split decision'
);

select results_eq(
  $$ select count(*)::bigint from public.split_decisions where decision_key = 'salah-or-saka-test' $$,
  $$ values (1::bigint) $$,
  'retry does not duplicate a split decision'
);

select lives_ok(
  $$ select public.persist_run_summary(
    '10000000-0000-4000-8000-000000000001', 'Creator-reported themes for the run.',
    '{"overview":"Creator-reported themes for the run.","overviewInterpretation":"CONSENSUS","overviewSupportingInsightIds":["50000000-0000-4000-8000-000000000001","50000000-0000-4000-8000-000000000002"],"sections":{"keyDevelopments":[{"statement":"Creators favour premium attackers.","interpretation":"CONSENSUS","supportingInsightIds":["50000000-0000-4000-8000-000000000001","50000000-0000-4000-8000-000000000002"]}],"strongestTransferRecommendations":[],"negativePlayers":[],"captaincy":[],"fixtureDevelopments":[],"minutesInjuriesRotation":[],"priceValue":[],"chipsWildcard":[]},"splitDecisionIds":["60000000-0000-4000-8000-000000000001"]}'::jsonb,
    '2026-08-08T13:00:00Z', 'test-summary-v1', 'fake-model', 800, 200, 1000
  ) $$,
  'structured run summary persists'
);

select results_eq(
  $$ select model, input_tokens, output_tokens, total_tokens from public.run_summaries where run_id = '10000000-0000-4000-8000-000000000001' and prompt_version = 'test-summary-v1' $$,
  $$ values ('fake-model'::text, 800, 200, 1000) $$,
  'summary model and usage are auditable'
);

select lives_ok(
  $$ select public.persist_run_summary(
    '10000000-0000-4000-8000-000000000001', 'Updated creator-reported themes.',
    '{"overview":"Updated creator-reported themes.","overviewInterpretation":"CREATOR_CLAIM","overviewSupportingInsightIds":["50000000-0000-4000-8000-000000000001"],"sections":{"keyDevelopments":[],"strongestTransferRecommendations":[],"negativePlayers":[],"captaincy":[],"fixtureDevelopments":[],"minutesInjuriesRotation":[],"priceValue":[],"chipsWildcard":[]},"splitDecisionIds":[]}'::jsonb,
    '2026-08-08T13:01:00Z', 'test-summary-v1', 'fake-model', 700, 150, 850
  ) $$,
  'explicit summary regeneration persists safely'
);

select results_eq(
  $$ select count(*)::bigint from public.run_summaries where run_id = '10000000-0000-4000-8000-000000000001' and prompt_version = 'test-summary-v1' $$,
  $$ values (2::bigint) $$,
  'explicit summary regeneration creates an auditable new report'
);

insert into public.entities (id, type, canonical_name, aliases)
values ('90000000-0000-4000-8000-000000000001', 'PLAYER', 'Ollie Watkins', array['Watkins']);

insert into public.episodes (id, source_id, external_episode_id, title, source_url, published_at, gameweek)
values
  ('90000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', 'watkins-august', 'Watkins August View', 'https://example.com/watkins-august', '2025-08-10T12:00:00Z', 2),
  ('90000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', 'watkins-january', 'Watkins January View', 'https://example.com/watkins-january', '2026-01-15T12:00:00Z', 22);

insert into public.insights (id, episode_id, claim, reasoning, primary_category, recommendation, time_horizon, creator_confidence, evidence_text, extraction_version)
values
  ('90000000-0000-4000-8000-000000000020', '90000000-0000-4000-8000-000000000010', 'Watkins is a hold in August.', 'Strong early fixtures.', 'TRANSFER_DECISION', 'HOLD', 'SHORT', 'HIGH', 'I would hold Watkins.', 'history-test-v1'),
  ('90000000-0000-4000-8000-000000000021', '90000000-0000-4000-8000-000000000011', 'Watkins became a sell in January.', 'Other forwards offered more.', 'TRANSFER_DECISION', 'SELL', 'SHORT', 'HIGH', 'I would now sell Watkins.', 'history-test-v1');

insert into public.insight_entities (insight_id, entity_id, role)
values
  ('90000000-0000-4000-8000-000000000020', '90000000-0000-4000-8000-000000000001', 'SUBJECT'),
  ('90000000-0000-4000-8000-000000000021', '90000000-0000-4000-8000-000000000001', 'SUBJECT');

select results_eq(
  $$ select count(*)::bigint from public.search_fpl_insights(array['Watkins'], '{}', '{}', '{}', null, null, '{}', array['Watkins'], 50, true, false, false) $$,
  $$ values (2::bigint) $$,
  'historical retrieval includes relevant records months apart'
);

select results_eq(
  $$ select array_agg(published_at order by published_at) from public.search_fpl_insights(array['Watkins'], '{}', '{}', '{}', null, null, '{}', array['Watkins'], 50, true, false, false) $$,
  $$ values (array['2025-08-10T12:00:00Z'::timestamptz, '2026-01-15T12:00:00Z'::timestamptz]) $$,
  'chronological comparison retains the complete matching period'
);

select results_eq(
  $$ select count(*)::bigint from public.search_fpl_insights(array['Watkins'], '{}', '{}', '{}', null, null, '{}', array['Watkins'], 50, false, true, false) $$,
  $$ values (2::bigint) $$,
  'current-decision ranking does not exclude older relevant evidence'
);

select results_eq(
  $$ select count(*)::bigint from public.search_fpl_insights(array['Watkins'], '{}', array['TRANSFER_DECISION'], array['FPL Forecast Lab'], null, '2025-12-31T23:59:59Z', '{}', '{}', 50, false, false, true) $$,
  $$ values (1::bigint) $$,
  'entity, category, creator, and date filters combine correctly'
);

select lives_ok(
  $$ select public.persist_episode_insight_extraction(
    '20000000-0000-4000-8000-000000000004', 'duplicate-entities-v1', 'test-prompt', 'fake-model', null, null, null, now(),
    '[{"claim":"Hold Watkins","reasoning":"Fixtures","primaryCategory":"TRANSFER_DECISION","recommendation":"HOLD","timeHorizon":"SHORT","creatorConfidence":"HIGH","validFromGameweek":null,"validToGameweek":null,"evidenceText":"Hold him","timestampSeconds":null,"tags":["forward"],"entities":[{"type":"PLAYER","canonicalName":"Ollie Watkins","aliases":["Watkins"],"role":"SUBJECT"},{"type":"PLAYER","canonicalName":"ollie watkins","aliases":["O. Watkins"],"role":"subject"}]}]'::jsonb
  ) $$,
  'duplicate normalized entity mentions persist safely'
);

select results_eq(
  $$ select count(*)::bigint from public.insight_entities ie join public.insights i on i.id = ie.insight_id where i.episode_id = '20000000-0000-4000-8000-000000000004' and i.extraction_version = 'duplicate-entities-v1' $$,
  $$ values (1::bigint) $$,
  'duplicate aliases resolve to one insight entity relationship'
);

select results_eq(
  $$ select public.persist_episode_insight_extraction(
    '20000000-0000-4000-8000-000000000004', 'empty-alias-regression-v1', 'test-prompt', 'fake-model', null, null, null, now(),
    '[{"claim":"One empty alias","reasoning":"Valid","primaryCategory":"TRANSFER_DECISION","recommendation":"HOLD","timeHorizon":"SHORT","creatorConfidence":"HIGH","validFromGameweek":null,"validToGameweek":null,"evidenceText":"Hold","timestampSeconds":null,"tags":["one","two"],"entities":[{"type":"PLAYER","canonicalName":"Cole Palmer","aliases":[],"role":"SUBJECT"}]},{"claim":"No entity","reasoning":"Valid","primaryCategory":"FIXTURES","recommendation":"WATCH","timeHorizon":"SHORT","creatorConfidence":"MEDIUM","validFromGameweek":null,"validToGameweek":null,"evidenceText":"Watch","timestampSeconds":null,"tags":[],"entities":[]}]'::jsonb
  ) $$,
  $$ values (2) $$,
  'valid empty alias arrays and several insights persist atomically'
);

select results_eq(
  $$ select aliases from public.entities where type = 'PLAYER' and canonical_name = 'Cole Palmer' $$,
  $$ values (array[]::text[]) $$,
  'empty aliases remain a canonical empty SQL array'
);

select throws_ok(
  $$ select public.persist_episode_insight_extraction(
    '20000000-0000-4000-8000-000000000004', 'scalar-entities-v1', 'test-prompt', 'fake-model', null, null, null, now(),
    '[{"claim":"Bad shape","reasoning":"Invalid","primaryCategory":"TRANSFER_DECISION","recommendation":"HOLD","timeHorizon":"SHORT","creatorConfidence":"HIGH","validFromGameweek":null,"validToGameweek":null,"evidenceText":"Hold","timestampSeconds":null,"tags":[],"entities":{"type":"PLAYER"}}]'::jsonb
  ) $$,
  'P0001',
  'Extraction validation failed: episode=20000000-0000-4000-8000-000000000004 insight=0 field=entities expected=array received=object',
  'scalar entities fail with precise deterministic context'
);

select results_eq(
  $$ select count(*)::bigint from public.insights where episode_id = '20000000-0000-4000-8000-000000000004' and extraction_version = 'scalar-entities-v1' $$,
  $$ values (0::bigint) $$,
  'shape validation leaves no partial extraction data'
);

select lives_ok(
  $$ select public.persist_episode_insight_extraction(
    '20000000-0000-4000-8000-000000000004', 'duplicate-entities-v1', 'test-prompt', 'fake-model', null, null, null, now(), '[]'::jsonb
  ) $$,
  'extraction retry remains idempotent'
);

select results_eq(
  $$ select count(*)::bigint from public.insight_entities ie join public.insights i on i.id = ie.insight_id where i.episode_id = '20000000-0000-4000-8000-000000000004' and i.extraction_version = 'duplicate-entities-v1' $$,
  $$ values (1::bigint) $$,
  'repeated extraction persistence does not duplicate relationships'
);

select lives_ok(
  $$ insert into public.processing_failures (run_id, episode_id, stage, error_message, retryable)
     values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', 'EXTRACTION_PERSISTENCE', 'constraint failure', false) $$,
  'structured episode failure persists'
);

select * from finish();
rollback;
