insert into public.sources (id, name, platform, channel_url, external_channel_id, enabled)
values
  ('00000000-0000-4000-8000-000000000010', 'Let''s Talk FPL', 'YOUTUBE', 'https://www.youtube.com/@LetsTalkFPL', 'UCxeOc7eFxq37yW_Nc-69deA', true),
  ('00000000-0000-4000-8000-000000000011', 'The FPL Wire', 'YOUTUBE', 'https://www.youtube.com/@TheFPLWire', 'UCtIPFexB6PLKNNl0XH3SKKw', true)
on conflict (platform, external_channel_id) do update set
  name = excluded.name,
  channel_url = excluded.channel_url,
  enabled = excluded.enabled;

update public.sources set enabled = false
where id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
);

insert into public.source_checkpoints (source_id)
select id from public.sources
where external_channel_id in ('UCxeOc7eFxq37yW_Nc-69deA', 'UCtIPFexB6PLKNNl0XH3SKKw')
on conflict do nothing;
