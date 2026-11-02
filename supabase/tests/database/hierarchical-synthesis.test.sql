begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_table('public', 'creator_synthesis_briefs', 'creator brief cache exists');
select has_column('public', 'creator_synthesis_briefs', 'input_hash', 'creator brief input hash is stored');
select has_column('public', 'creator_synthesis_briefs', 'brief_data', 'creator brief structured data is stored');
select has_column('public', 'run_summaries', 'synthesis_mode', 'synthesis mode is stored');
select has_column('public', 'run_summaries', 'eligible_insight_count', 'eligible insight count is stored');
select has_column('public', 'run_summaries', 'creator_brief_count', 'creator brief count is stored');
select has_column('public', 'run_summaries', 'reduction_model', 'reduction model is stored');
select lives_ok($$ insert into public.ai_usage_events(task_type,model,status,request_id,input_tokens,cached_input_tokens,output_tokens,total_tokens,started_at,completed_at) values ('SYNTHESIS_REDUCTION','gpt-5.6-luna','COMPLETED','00000000-0000-4000-8000-000000000099',10,0,5,15,now(),now()) $$, 'reduction usage can be audited');

select * from finish();
rollback;
