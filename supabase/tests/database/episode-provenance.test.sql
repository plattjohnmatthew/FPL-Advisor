begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select has_table('public', 'transcript_segments', 'timestamped transcript segments are relational');
select has_table('public', 'insight_evidence_segments', 'insight evidence links are relational');

insert into public.sources (id, name, platform, channel_url, external_channel_id)
values ('11000000-0000-4000-8000-000000000001', 'Timestamp Creator', 'YOUTUBE', 'https://youtube.com/channel/test', 'timestamp-channel');
insert into public.episodes (id, source_id, external_episode_id, title, source_url, published_at)
values ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'timestamp001', 'Timestamp episode', 'https://www.youtube.com/watch?v=timestamp001', now());
insert into public.transcripts (id, episode_id, provider, raw_text, language, content_hash, segments)
values ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'supadata', 'First segment Second segment', 'en', 'timestamp-hash',
  '[{"startSeconds":0,"endSeconds":5,"text":"First segment"},{"startSeconds":5,"endSeconds":10,"text":"Second segment"}]');

select is((select count(*)::integer from public.transcript_segments where transcript_id = '31000000-0000-4000-8000-000000000001'), 2, 'stored Supadata segments are preserved');

select throws_ok(
  $$select public.persist_episode_insight_extraction('21000000-0000-4000-8000-000000000001','invalid-segment','prompt','model',1,1,2,now(),
    '[{"claim":"Claim","reasoning":"Reason","primaryCategory":"TRANSFER_DECISION","recommendation":"BUY","timeHorizon":"SHORT","creatorConfidence":"HIGH","entities":[],"tags":[],"evidenceText":"Evidence","evidenceSegmentIds":[9],"timestampSeconds":5,"validFromGameweek":null,"validToGameweek":null}]')$$,
  'P0001', 'Extraction validation failed: episode=21000000-0000-4000-8000-000000000001 insight=0 field=evidenceSegmentIds invalid stored segment ID=9',
  'an unknown evidence segment fails transactionally');

select lives_ok(
  $$select public.persist_episode_insight_extraction('21000000-0000-4000-8000-000000000001','valid-segment','prompt','model',1,1,2,now(),
    '[{"claim":"Claim","reasoning":"Reason","primaryCategory":"TRANSFER_DECISION","recommendation":"BUY","timeHorizon":"SHORT","creatorConfidence":"HIGH","entities":[],"tags":[],"evidenceText":"Evidence","evidenceSegmentIds":[1],"timestampSeconds":5,"validFromGameweek":null,"validToGameweek":null}]')$$,
  'a valid stored segment can be cited');
select is((select count(*)::integer from public.insight_evidence_segments), 1, 'the insight retains its segment evidence link');

select * from finish();
rollback;
