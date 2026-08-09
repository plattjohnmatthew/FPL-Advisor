create or replace function public.set_default_source_selection(target_source_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested_count integer;
  valid_count integer;
begin
  select count(distinct source_id) into requested_count
  from unnest(target_source_ids) as selected(source_id);
  select count(*) into valid_count from public.sources
  where id = any(target_source_ids) and enabled = true;
  if valid_count <> requested_count then
    raise exception 'One or more selected creators are missing or disabled.' using errcode = '22023';
  end if;
  update public.sources set selected_by_default = (id = any(target_source_ids)) where true;
end;
$$;

grant execute on function public.set_default_source_selection(uuid[]) to service_role;
