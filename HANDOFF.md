# Telegram trading bot — handoff

Branch `feat/telegram-trading-bot`. Read this, then `lib/trade/execute.ts`, then start.

## What we are building

A Telegram bot. A user connects their x.com account, deposits SOL into a
bot-custodied wallet, sets spending limits, describes their trading edge in
plain English, and the bot buys and sells Solana memecoins with real money on
mainnet.

Jeremy has signed off on real funds explicitly. Do not re-open that decision.
Do keep every rail described below.

## Setup

```
cd /Users/jeremy/Development/Veyro/veyro-live
git checkout feat/telegram-trading-bot && git pull
npm install
npx tsc --noEmit    # lib/ is clean; app/ JSX errors are pre-existing
```

## Done

| Path | What it is |
| --- | --- |
| `lib/types.ts` | Every shared domain type. Import these, never redefine. |
| `lib/app.ts` | Frozen interface that channel adapters call. All bodies throw `NOT_IMPLEMENTED`. |
| `supabase/migrations/0003_telegram_trading.sql` | Users, limits, spend ledger, strategies, candidates, positions, Telegram dedupe. **Not yet applied.** |
| `lib/db.ts` | Typed access to all of it. |
| `lib/wallet/custody.ts` | Per-user `Keypair`, AES-256-GCM encrypted into `veyro_secrets`. Never on disk, never logged. |
| `lib/trade/jupiter.ts` | Quote, build, sign, simulate, send. Verified live against `lite-api.jup.ag/swap/v1/*`. |
| `lib/trade/execute.ts` | `buy`, `sell`, `reconcile`, `headroom`. The money path. |
| `AGENTS.md` | Rewritten to permit mainnet spending with named constraints. |

## Not done

1. **Telegram channel layer.** Nothing exists. `app/api/telegram/webhook/route.ts`,
   `lib/telegram/*`. Commands: `/start /connect /wallet /limits /revoke /edge
   /scan /why /buy /sell /positions /help`. An inline-keyboard confirmation is
   the commit point for any `/buy`.
2. **X OAuth 2.0 PKCE.** `app/api/oauth/x/**`. `linkX()` is the stub.
3. **Market feed.** `lib/market/*`, `worker/*`. PumpPortal at
   `wss://pumpportal.fun/api/data` is free: `subscribeNewToken`,
   `subscribeMigration`. Needs its own Railway process; Next.js cannot hold a
   socket open.
4. **Rejection filter and scoring.** `lib/market/filter.ts` producing
   `Assessment`. The `RejectReason` union in `lib/types.ts` is the list to
   implement.
5. **Strategy compiler.** `lib/strategy/*`. Plain English to
   `CompiledStrategy`, stored versioned via `writeStrategy()`.
6. **`lib/app.ts` bodies.**
7. **On-chain gate.** Program `2Z7xH99Z4YvG4U2Ew5PUZtVh8FE1VRhQ1Mo9dFvRvS3Q`
   dispatches on a single byte (`CREATE_POLICY=1`, `REVOKE_POLICY=2`,
   `CHECK_SPEND=3`) over a hand-packed 154-byte policy account. The vendored
   `@veyro/sdk` only speaks Anchor discriminators, so no client exists. Source:
   `../veyro-protocol/programs/veyro-mainnet/src/lib.rs`. Fast-follow, not a
   blocker.

## Three things that will bite you

**The reservation lifecycle in `execute.ts`.** A reservation is released only
when we can prove no value moved. Sent-but-unproven leaves the position
`UNKNOWN` with the reservation still held. Do not tidy that up. Losing a little
daily headroom is recoverable; double-spending it is not.

**`veyro_claim_spend` is the only authority on limits.** Never reimplement the
checks in TypeScript, and never spend against a reservation you did not
receive.

**`validateOrigin()` in `lib/auth.ts` will reject Telegram.** Do not apply it to
the webhook route. Verify `X-Telegram-Bot-Api-Secret-Token` with a timing-safe
compare instead, and dedupe on `update_id` via `veyro_claim_telegram_update()`.
Telegram retries webhooks, and a redelivered `/buy` must not open a second
position.

## Blocked on Jeremy

`TELEGRAM_BOT_TOKEN` · `TELEGRAM_WEBHOOK_SECRET` · `SOLANA_MAINNET_RPC_URL`
(a paid endpoint; public mainnet-beta will rate-limit a trading bot into
uselessness) · `ANTHROPIC_API_KEY` · X OAuth client id and secret · migration
0003 applied to Supabase.

`VEYRO_TRADING_ENABLED` defaults to `false` and is the hard off-switch.

## Open risk, not a code problem

Wallets are custodial and the non-custodial program is not deployed to mainnet.
If the service is compromised, user funds are gone. That needs a disclosure and
a decision from Jeremy, not a patch.

## House rules

Never call the launch feed alpha, an edge, or a prediction. Say what was
measured and what was rejected. Tell users in plain language that the service
holds their keys before they deposit. No hype copy. Conventional commits. Never
`git add -A` blindly: npm rewrites `package-lock.json` with `libc` churn that
should not be committed.
