begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public', 'app_settings', 'current AI settings table exists');
select has_table('public', 'app_setting_versions', 'AI setting history exists');
select has_function('public', 'save_ai_instruction_settings', array['text','text'], 'atomic settings writer exists');
select is((select count(*)::integer from public.app_settings), 2, 'both fixed settings are seeded');
select is((select count(*)::integer from public.app_setting_versions), 2, 'initial versions are retained');

select lives_ok(
  $$ select public.save_ai_instruction_settings('New extraction emphasis', 'New synthesis style') $$,
  'settings can be updated'
);
select is((select version from public.app_settings where key = 'EXTRACTION_CUSTOM_INSTRUCTIONS'), 2, 'changed extraction setting increments version');
select is((select value from public.app_setting_versions where key = 'EXTRACTION_CUSTOM_INSTRUCTIONS' and version = 2), 'New extraction emphasis', 'historical extraction text is retained');
select is((select version from public.app_settings where key = 'SYNTHESIS_CUSTOM_INSTRUCTIONS'), 2, 'changed synthesis setting increments independently');

select lives_ok(
  $$ select public.save_ai_instruction_settings('New extraction emphasis', 'New synthesis style') $$,
  'saving identical values is idempotent'
);
select is((select version from public.app_settings where key = 'EXTRACTION_CUSTOM_INSTRUCTIONS'), 2, 'identical values do not create a version');
select throws_ok(
  $$ insert into public.app_settings (key, value) values ('UNSUPPORTED', 'bad') $$,
  '23514', null, 'unsupported setting keys are rejected'
);

select * from finish();
rollback;
