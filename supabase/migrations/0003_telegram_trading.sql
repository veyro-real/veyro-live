-- Telegram trading bot: users, custodied wallets, limits, strategies,
-- market candidates and positions.
--
-- Spend enforcement lives in veyro_claim_spend, not in application code.
-- The prior engine serialised everything behind one in-process promise queue,
-- which does not survive a second user or a second Railway replica.

create table if not exists public.veyro_users (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id text not null unique,
  telegram_username text,
  wallet_pubkey text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.veyro_limits (
  user_id uuid primary key references public.veyro_users(id) on delete cascade,
  max_trade_lamports bigint not null check (max_trade_lamports > 0),
  daily_cap_lamports bigint not null check (daily_cap_lamports > 0),
  expires_at timestamptz not null,
  active boolean not null default true,
  policy_address text,
  agent_pubkey text,
  updated_at timestamptz not null default now(),
  constraint daily_cap_at_least_one_trade check (daily_cap_lamports >= max_trade_lamports)
);

-- Append-only. One row per reservation; never updated, never deleted.
-- Settlement writes the outcome so an abandoned reservation is visible.
create table if not exists public.veyro_spend_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.veyro_users(id) on delete cascade,
  day date not null,
  lamports bigint not null check (lamports > 0),
  state text not null default 'RESERVED' check (state in ('RESERVED','SETTLED','RELEASED')),
  position_id uuid,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists veyro_spend_ledger_user_day
  on public.veyro_spend_ledger (user_id, day) where state <> 'RELEASED';

create table if not exists public.veyro_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.veyro_users(id) on delete cascade,
  version integer not null,
  raw_text text not null,
  compiled jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);

-- Only one active strategy per user; new versions deactivate the old one.
create unique index if not exists veyro_strategies_one_active
  on public.veyro_strategies (user_id) where active;

create table if not exists public.veyro_candidates (
  mint text primary key,
  symbol text not null,
  name text not null,
  launchpad text not null,
  creator text not null,
  first_seen timestamptz not null default now(),
  raw jsonb not null,
  assessment jsonb,
  assessed_at timestamptz
);

create index if not exists veyro_candidates_first_seen
  on public.veyro_candidates (first_seen desc);

create index if not exists veyro_candidates_unassessed
  on public.veyro_candidates (first_seen) where assessment is null;

create table if not exists public.veyro_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.veyro_users(id) on delete cascade,
  mint text not null,
  symbol text not null,
  status text not null check (status in ('OPENING','OPEN','CLOSING','CLOSED','FAILED','UNKNOWN')),
  entry_signature text,
  entry_lamports bigint not null,
  tokens_received numeric,
  exit_signature text,
  exit_lamports bigint,
  reason text not null default '',
  strategy_id uuid references public.veyro_strategies(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists veyro_positions_user_status
  on public.veyro_positions (user_id, status, opened_at desc);

-- One open position per user per mint. Stops a double /buy from doubling down
-- by accident; an intentional add is an explicit second command later.
create unique index if not exists veyro_positions_one_open_per_mint
  on public.veyro_positions (user_id, mint)
  where status in ('OPENING','OPEN','CLOSING');

-- Idempotency for Telegram: update_id is monotonic per bot, so a redelivered
-- webhook is a no-op instead of a second trade.
create table if not exists public.veyro_telegram_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);

alter table public.veyro_users enable row level security;
alter table public.veyro_limits enable row level security;
alter table public.veyro_spend_ledger enable row level security;
alter table public.veyro_strategies enable row level security;
alter table public.veyro_candidates enable row level security;
alter table public.veyro_positions enable row level security;
alter table public.veyro_telegram_updates enable row level security;

-- Atomically check every limit and reserve the spend, or deny with a reason.
-- Locking the limits row serialises concurrent claims for one user without
-- blocking anyone else.
create or replace function public.veyro_claim_spend(p_user uuid, p_lamports bigint)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  l record;
  used bigint;
  claim uuid;
  today date := (now() at time zone 'utc')::date;
begin
  if p_lamports is null or p_lamports <= 0 then
    return jsonb_build_object('decision','DENY','reason','INVALID_AMOUNT');
  end if;

  select * into l from public.veyro_limits where user_id = p_user for update;
  if not found then
    return jsonb_build_object('decision','DENY','reason','NO_LIMITS_SET');
  end if;
  if not l.active then
    return jsonb_build_object('decision','DENY','reason','LIMITS_REVOKED');
  end if;
  if l.expires_at <= now() then
    return jsonb_build_object('decision','DENY','reason','LIMITS_EXPIRED');
  end if;
  if p_lamports > l.max_trade_lamports then
    return jsonb_build_object('decision','DENY','reason','MAX_TRADE_EXCEEDED');
  end if;

  select coalesce(sum(lamports),0) into used
    from public.veyro_spend_ledger
   where user_id = p_user and day = today and state <> 'RELEASED';

  if used + p_lamports > l.daily_cap_lamports then
    return jsonb_build_object('decision','DENY','reason','DAILY_CAP_EXCEEDED');
  end if;

  insert into public.veyro_spend_ledger(user_id, day, lamports)
  values (p_user, today, p_lamports)
  returning id into claim;

  return jsonb_build_object('decision','ALLOW','reservationId',claim);
end;
$$;

-- Settle or release a reservation. Releasing returns the headroom to the
-- daily cap; settling makes the spend permanent.
create or replace function public.veyro_settle_spend(p_claim uuid, p_state text, p_position uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if p_state not in ('SETTLED','RELEASED') then
    raise exception 'INVALID_SETTLEMENT_STATE';
  end if;
  update public.veyro_spend_ledger
     set state = p_state, position_id = p_position, settled_at = now()
   where id = p_claim and state = 'RESERVED';
end;
$$;

-- Returns true the first time an update_id is seen, false on redelivery.
create or replace function public.veyro_claim_telegram_update(p_update_id bigint)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
  insert into public.veyro_telegram_updates(update_id) values (p_update_id)
  on conflict do nothing;
  return found;
end;
$$;

revoke all on
  public.veyro_users, public.veyro_limits, public.veyro_spend_ledger,
  public.veyro_strategies, public.veyro_candidates, public.veyro_positions,
  public.veyro_telegram_updates
from anon, authenticated;

revoke all on function
  public.veyro_claim_spend(uuid,bigint),
  public.veyro_settle_spend(uuid,text,uuid),
  public.veyro_claim_telegram_update(bigint)
from public, anon, authenticated;

grant select, insert, update on
  public.veyro_users, public.veyro_limits, public.veyro_strategies,
  public.veyro_candidates, public.veyro_positions
to service_role;

grant select, insert on public.veyro_spend_ledger, public.veyro_telegram_updates to service_role;

grant execute on function
  public.veyro_claim_spend(uuid,bigint),
  public.veyro_settle_spend(uuid,text,uuid),
  public.veyro_claim_telegram_update(bigint)
to service_role;
