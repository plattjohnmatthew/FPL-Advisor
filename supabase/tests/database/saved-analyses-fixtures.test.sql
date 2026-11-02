begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_table('public','research_analyses','saved research analyses are durable');
select has_column('public','research_analyses','evidence_fingerprint','analysis reuse records the evidence identity');
select has_index('public','research_analyses','research_analyses_scope_idx','analysis scope lookup is indexed');
select has_table('public','fpl_fixtures','official FPL fixtures are persisted');
select has_column('public','fpl_fixtures','home_difficulty','home fixture difficulty is stored');
select has_column('public','fpl_fixtures','away_difficulty','away fixture difficulty is stored');
select has_index('public','fpl_fixtures','fpl_fixtures_event_idx','fixture gameweek lookup is indexed');

insert into public.research_analyses(context_mode,question,normalized_question,scope_preset,scope_label,query_fingerprint,evidence_fingerprint,response_data,query_model,answer_model)
values ('GLOBAL','Should I sell Saka?','should i sell saka','LAST_7_DAYS','Last 7 days','query-hash','evidence-hash','{"question":"Should I sell Saka?"}'::jsonb,'gpt-test','gpt-test');
select is((select count(*)::integer from public.research_analyses),1,'a validated answer can be saved before the client receives it');

select * from finish();
rollback;
