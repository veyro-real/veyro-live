-- Paper trading.
--
-- A new user practises with simulated funds against real Jupiter quotes, and
-- switches to live money when they choose to. Paper is the default because
-- the alternative is a first-time user learning the confirm flow with real
-- SOL on a token that is four minutes old.
--
-- Paper fills are priced from the same quote endpoint a live trade would use,
-- so the numbers are real even though the transaction never exists. No paper
-- row ever carries a signature: a row with a signature happened on chain.

alter table public.veyro_users
  add column if not exists mode text not null default 'paper'
  check (mode in ('paper','live'));

-- Simulated balance, in lamports. Seeded at 5 SOL, which is enough to make
-- several mistakes with and small enough that nobody mistakes it for real.
alter table public.veyro_users
  add column if not exists paper_lamports bigint not null default 5000000000
  check (paper_lamports >= 0);

alter table public.veyro_positions
  add column if not exists paper boolean not null default false;

-- A paper position and a live position in the same mint are different things
-- and must both be allowed. Replacing the old index rather than adding to it,
-- because the old one would still reject the pair.
drop index if exists veyro_positions_one_open_per_mint;
create unique index if not exists veyro_positions_one_open_per_mint
  on public.veyro_positions (user_id, mint, paper)
  where status in ('OPENING','OPEN','CLOSING');

create index if not exists veyro_positions_user_paper
  on public.veyro_positions (user_id, paper, status, opened_at desc);

-- A simulated fill has no transaction, so a signature on a paper row would be
-- a fabricated one. Refuse it at the schema rather than trusting callers.
alter table public.veyro_positions
  drop constraint if exists veyro_positions_paper_has_no_signature;
alter table public.veyro_positions
  add constraint veyro_positions_paper_has_no_signature
  check (not paper or (entry_signature is null and exit_signature is null));
