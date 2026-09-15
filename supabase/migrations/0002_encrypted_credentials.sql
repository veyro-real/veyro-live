create table if not exists public.veyro_secrets (
  id text primary key,
  encrypted_value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.veyro_secrets enable row level security;

revoke all on public.veyro_secrets from anon, authenticated;
grant select, insert, update on public.veyro_secrets to service_role;
