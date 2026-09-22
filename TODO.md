# Telegram trading bot — what's left

State at the time of writing: 289 tests, `tsc --noEmit` clean, production build
passes. Nothing is deployed with the bot in it. See `HANDOFF.md` for how the
pieces fit together.

## Blocking the demo

Nothing else matters until these are done.

- [x] ~~Switch the Railway service branch to `feat/telegram-trading-bot`.~~
      No longer applies: the bot is on `main`, and the workspace moved to
      `apps/*` and `packages/*`. Railway stays on `main`.
- [ ] **Confirm `veyro.wtf` loads, then that the webhook route returns 401 and
      not 404.** 401 means the code is live and correctly rejecting an
      unauthenticated request. DNS is already correct: Cloudflare flattens the
      apex CNAME to Railway.
- [ ] Set `VEYRO_APP_ORIGIN` and repoint `setWebhook` off the laptop tunnel.
- [ ] **Second Railway service**, same repo and branch, start command
      `npm run worker`. One process cannot serve HTTP and hold a websocket.
- [ ] **Send SOL to the custodied wallet.** No trade can execute without it;
      `execute.buy` stops at `INSUFFICIENT_BALANCE` before anything is built.

## Before real money

- [ ] **Rotate all four secrets**: bot token, `TELEGRAM_WEBHOOK_SECRET`,
      Supabase service role key, `VEYRO_CREDENTIALS_KEY`. All four passed
      through a chat transcript during development. Nothing was ever committed
      (history is clean) but treat them as public.

      Ordering matters: `VEYRO_CREDENTIALS_KEY` can only be rotated while every
      balance is zero. Changing it orphans every wallet secret encrypted under
      it, permanently. Now is the cheapest this will ever be.

      The specific hazard while the webhook secret is known: a forged update is
      a genuine first delivery carrying a valid confirmation, so neither
      double-spend guard applies to it.

- [ ] **Decide the custody model.** Today one `VEYRO_CREDENTIALS_KEY` in an
      environment variable decrypts every user's wallet. One key, one
      compromise, everything. The alternatives are KMS envelope encryption or a
      provider like Turnkey or Privy where raw keys are never held. This is the
      single largest risk in the product and it is a decision, not a patch.

- [ ] **Make `veyro-live` private.** It is a custodial service and the repo is
      currently public. `lib/market/filter.ts` also exports every threshold,
      which is a specification for passing the filter.

## Build, roughly by value

- [ ] **A trade data source.** `lib/market/flow.ts` computes seventeen
      order-flow features and is fully tested; it currently measures zero
      trades. PumpPortal answers `subscribeTokenTrade` with *"only available
      when connecting with an API key funded with at least 0.02 SOL"*. Either
      fund that key, or poll Helius `/v0/addresses/{mint}/transactions` once at
      window close, which is one request per token and reuses the existing key.

- [ ] **Creator history**, via Helius per-creator transactions, cacheable.
      Implements `CREATOR_SERIAL_LAUNCHER` and `CREATOR_PRIOR_RUG`.

      Worth stating plainly: measured against live launches, the structural
      filter currently rejects almost nothing. Mint and freeze authority are
      revoked on every pump.fun token by construction, concentration is not
      meaningful before a float exists, and liquidity and market cap are always
      in range. Creator history and order flow are the only checks with real
      discriminating power, and neither has a data source wired.

- [ ] **"Buy the dumbest memecoin on X."** `lib/research.ts` already searches X,
      extracts mints, verifies them on chain and ranks by engagement. Three
      gaps: `X_BEARER_TOKEN` is unset; it is not reachable from `lib/app.ts` or
      the router; and it verifies candidates as *classic* SPL mints, so it
      would silently skip Token-2022 tokens, which is what pump.fun launches
      are. The voice intent mapper already handles free speech, so the phrase
      maps cleanly once the plumbing exists.

- [ ] **Auto bag manager.** `lib/trade/exit.ts` decides take profit, stop loss,
      trailing and max hold, priced net of the round trip, and is tested.
      Nothing calls it. Auto-sell needs no spend authority, since selling
      returns funds. Auto-buy is a different risk class and should sit behind
      an explicit flag rather than a phrase in `/edge`.

- [ ] **CI for this repo.** There is no `.github/workflows`. 289 tests and the
      production build only run on a developer machine, and a Railway build
      runs `next build` alone, so a failing test cannot stop a deploy.

- [ ] Dollar-denominated limits (needs a price feed; everything is lamports
      today), USDC as a configurable input mint, and `/connect` X OAuth.

## Known and deliberate

- **Synthesis is Mac-only; transcription is not, any more.** `say` still does
  not exist in the Linux container, so the bot replies in text there.
  Transcription has a hosted path: set `OPENAI_API_KEY` and voice notes are
  transcribed by `gpt-4o-mini-transcribe`, which takes Telegram's OGG/Opus as
  delivered and needs neither ffmpeg nor a model file. Without the key it
  falls back to whisper.cpp, and without that it says it cannot hear rather
  than ignoring the note.
- **`lib/chain/policy.ts` hardcodes byte offsets** from `veyro-protocol`. The
  layout is documented in that repo's `docs/MAINNET_WIRE_FORMAT.md`, but nothing
  mechanically couples them: change an offset there and this client keeps
  compiling and starts producing transactions the program rejects on chain.
- **`/connect` says X linking is not available** rather than pretending.
