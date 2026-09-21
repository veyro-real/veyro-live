# Pending: 0004_paper_trading.sql

**Do not deploy `main` until this migration has run.**

## What happens if you do

`app.buy` reads `veyro_users.mode`. A row without that column reads as
`undefined`, which is not `'live'`, so every buy routes to paper — and paper
inserts a `veyro_positions.paper` column that does not exist yet. PostgREST
rejects the insert and the user sees
`DB_OPEN_POSITION: column "paper" does not exist`.

Buying is broken until the migration runs. Nothing dangerous happens: no
transaction is built, no SOL moves, and no trade is misrouted to live. It
fails loudly and early, which is the failure mode to want, but it is still an
outage.

## Applying it

Either, with the database password:

```
supabase db push
```

Or paste `supabase/migrations/0004_paper_trading.sql` into the Supabase SQL
editor and run it. It is idempotent — `add column if not exists`, and the
index and constraint are dropped before being recreated — so running it twice
is safe.

## Confirming it worked

```
select mode, paper_lamports from veyro_users limit 1;
select paper from veyro_positions limit 1;
```

Both should return columns rather than an error. Then deploy, and check
`/mode` in Telegram reports paper with a 5 SOL simulated balance.

## Why paper is the default

Existing users flip to paper on the next deploy, including yours. That is
deliberate: the two rows in `veyro_users` have no wallet and no funds, and a
first trade on simulated money is the right default for a test group. Anyone
who wants real money sends `/live`.
