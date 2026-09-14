create table if not exists public.veyro_state (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.veyro_attempts (
  id uuid primary key,
  session text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists veyro_attempts_session_created
  on public.veyro_attempts (session, created_at desc);

create table if not exists public.veyro_events (
  id bigint generated always as identity primary key,
  attempt uuid not null references public.veyro_attempts(id),
  at timestamptz not null default now(),
  payload jsonb not null
);

alter table public.veyro_state enable row level security;
alter table public.veyro_attempts enable row level security;
alter table public.veyro_events enable row level security;

create or replace function public.veyro_record_attempt(p_id uuid,p_session text,p_payload jsonb)
returns void language plpgsql security invoker set search_path=public as $$
begin
  insert into public.veyro_attempts(id,session,payload)
  values(p_id,p_session,p_payload)
  on conflict(id) do update set payload=excluded.payload,updated_at=now();
  insert into public.veyro_events(attempt,payload) values(p_id,p_payload);
end;
$$;

create or replace function public.veyro_claim_request(p_id text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare existing jsonb;
begin
  insert into public.veyro_state(id,value) values(p_id,'"IN_PROGRESS"'::jsonb)
  on conflict(id) do nothing;
  if found then return null; end if;
  select value into existing from public.veyro_state where id=p_id;
  return existing;
end;
$$;

revoke all on public.veyro_state,public.veyro_attempts,public.veyro_events from anon,authenticated;
revoke all on function public.veyro_record_attempt(uuid,text,jsonb),public.veyro_claim_request(text) from public,anon,authenticated;
grant select,insert,update on public.veyro_state,public.veyro_attempts to service_role;
grant select,insert on public.veyro_events to service_role;
grant usage,select on sequence public.veyro_events_id_seq to service_role;
grant execute on function public.veyro_record_attempt(uuid,text,jsonb),public.veyro_claim_request(text) to service_role;
