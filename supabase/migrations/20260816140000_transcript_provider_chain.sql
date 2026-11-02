alter table public.transcript_provider_calls
  add column provider_role text not null default 'PRIMARY'
    check (provider_role in ('PRIMARY', 'FALLBACK')),
  add column fallback_reason text,
  add column fallback_provider text,
  add column fallback_subsequently_used boolean not null default false;

create index transcript_provider_calls_provider_role_idx
  on public.transcript_provider_calls (provider, provider_role, completed_at desc);
