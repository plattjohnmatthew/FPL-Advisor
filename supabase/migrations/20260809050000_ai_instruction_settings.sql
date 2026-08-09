create table public.app_settings (
  key text primary key check (key in ('EXTRACTION_CUSTOM_INSTRUCTIONS', 'SYNTHESIS_CUSTOM_INSTRUCTIONS')),
  value text not null check (length(value) <= 4000),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create table public.app_setting_versions (
  key text not null check (key in ('EXTRACTION_CUSTOM_INSTRUCTIONS', 'SYNTHESIS_CUSTOM_INSTRUCTIONS')),
  version integer not null check (version > 0),
  value text not null check (length(value) <= 4000),
  created_at timestamptz not null default now(),
  primary key (key, version)
);

alter table public.app_settings enable row level security;
alter table public.app_setting_versions enable row level security;
revoke all on public.app_settings from anon, authenticated;
revoke all on public.app_setting_versions from anon, authenticated;
grant select, insert, update on public.app_settings to service_role;
grant select, insert on public.app_setting_versions to service_role;

insert into public.app_settings (key, value) values
  ('EXTRACTION_CUSTOM_INSTRUCTIONS', 'Pay particular attention to short-term punts, players whose minutes are uncertain, and price-rise speculation. Avoid extracting generic praise that has no FPL decision impact.'),
  ('SYNTHESIS_CUSTOM_INSTRUCTIONS', 'Write the report like a concise expert FPL briefing. Prioritize transfers, fixtures, chips and creator disagreement. Avoid repeating similar arguments.');

insert into public.app_setting_versions (key, version, value)
select key, version, value from public.app_settings;

create function public.save_ai_instruction_settings(
  target_extraction_instructions text,
  target_synthesis_instructions text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  setting_key text;
  setting_value text;
  new_version integer;
begin
  for setting_key, setting_value in
    select * from (values
      ('EXTRACTION_CUSTOM_INSTRUCTIONS'::text, btrim(target_extraction_instructions)),
      ('SYNTHESIS_CUSTOM_INSTRUCTIONS'::text, btrim(target_synthesis_instructions))
    ) requested(key, value)
  loop
    if setting_value is null or length(setting_value) > 4000 then
      raise exception 'Invalid AI instruction setting: %', setting_key;
    end if;

    update public.app_settings
      set value = setting_value, version = version + 1, updated_at = now()
      where key = setting_key and value is distinct from setting_value
      returning version into new_version;

    if new_version is not null then
      insert into public.app_setting_versions (key, version, value)
      values (setting_key, new_version, setting_value);
    end if;
    new_version := null;
  end loop;
end;
$$;

revoke all on function public.save_ai_instruction_settings(text, text) from public;
grant execute on function public.save_ai_instruction_settings(text, text) to service_role;
