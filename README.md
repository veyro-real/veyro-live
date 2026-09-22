# Veyro Live

A pnpm workspace. `apps/control-plane` is the Next.js app and the Telegram
webhook; `apps/market-worker` holds the launch-feed socket; `packages/bot` is
every decision either of them makes. The original agent workspace — monochrome
interface, Supabase audit records, read-only crypto-X research, protocol
execution and a small MCP endpoint — still lives in the control plane.

## Telegram bot: local run and demo

```sh
npx pnpm@10.17.1 install
npx pnpm@10.17.1 test        # 405 tests
npx pnpm@10.17.1 typecheck
npx pnpm@10.17.1 build
```

Minimum to talk to the bot: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VEYRO_CREDENTIALS_KEY`,
`SOLANA_MAINNET_RPC_URL`. Put them in `apps/control-plane/.env.local`, which is
gitignored; Next reads env from the app directory, not the repo root.

Nothing reaches the bot until Telegram is told where to send updates:

```sh
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"$VEYRO_APP_ORIGIN/api/telegram/webhook\",
       \"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",
       \"allowed_updates\":[\"message\",\"callback_query\"]}"
```

`getWebhookInfo` reports the last delivery error and is the first place to look
when the bot goes quiet. An unauthenticated GET of the webhook route should
answer 401, not 404: 401 means the code is deployed and correctly refusing.

### Voice

Set `OPENAI_API_KEY` and voice notes are transcribed by
`gpt-4o-mini-transcribe`, which accepts Telegram's OGG/Opus as delivered and
needs neither ffmpeg nor a local model — so it is the only path that works in
the container. Without the key it falls back to whisper.cpp against a local
ggml model, which exists only on a developer Mac. Without either, the bot says
it cannot hear rather than ignoring the note. `VEYRO_VOICE_DISABLED=true`
turns it off outright.

Replies are spoken with macOS `say`, which the container does not have, so a
deployed bot answers in text.

### The demo flow

Send, or say, **"Find the best Solana meme coin and buy one hundred dollars."**

1. The note is transcribed and echoed back verbatim, so a misheard instruction
   is visible before it does anything.
2. Dollars are converted once, against Jupiter's quote for selling one SOL, and
   the rate is shown. Limits, positions and the ledger are lamports throughout.
3. The candidate, its mint, the quote, price impact and slippage are shown with
   a Confirm keyboard. **Nothing trades before that tap.**
4. Confirming consumes the pending record through `veyro_claim_request`, so a
   second tap cannot buy twice.
5. `/mode paper` simulates the fill at real quoted prices and records the whole
   lifecycle. Live trading additionally requires `VEYRO_TRADING_ENABLED=true`,
   which defaults to false and is the hard off-switch.

`/fund` (or `/wallet`) shows the deposit address and balance. An unreadable
balance is never rendered as zero. The on-ramp button is deliberately not
prefilled with the address: the wallet is custodial, and every hosted on-ramp
requires the buyer to be the sole owner of the destination.

### Before real money

Rotate `VEYRO_CREDENTIALS_KEY` **while balances are zero** — it decrypts every
wallet secret, and changing it later orphans them permanently. See `TODO.md`.

## Supabase

Run `supabase/migrations/0001_veyro_store.sql` in the project SQL editor, then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as server-only Railway variables. Policy state, idempotency claims, attempts and append-only attempt events use Supabase. The deployed app fails closed when Supabase is missing or unavailable. The anon key is not used and browser clients have no table access. Automated tests explicitly use a process-local memory store.

## Deploy on Railway now

1. Create a service from **veyro-real/veyro-live**. Keep the root directory unchanged; Railway detects the Dockerfile.
2. Set the required Supabase variables and `VEYRO_MODE=rehearsal`. Generate a public domain and set `VEYRO_APP_ORIGIN` to that exact HTTPS origin, with no trailing slash.
3. Deploy. The full rehearsal flow works without X credentials or blockchain keys. It explicitly labels simulated balances and produces no transaction signatures.
4. Point the landing page's `VEYRO_LIVE_URL` at this service and rebuild the landing page.

The container accepts Railway's `PORT` and runs the app as the unprivileged `node` user. It does not copy secrets from the repository into the image.

## Enable real X research

Set `X_BEARER_TOKEN` privately in Railway variables and set `VEYRO_OPERATOR_TOKEN` to a separate random string of at least 32 characters. Open Connection settings in the app and enter the operator token. Do not paste wallet keys into the interface.

The service calls only `GET /2/tweets/search/recent`: one fixed crypto/Solana query, up to 20 posts, five-minute caching, and a persistent daily request cap (default 10; configurable 1–50). Attempts count against the cap even if X fails. **Reads can consume credits. A request cap is not a guaranteed dollar cap.** No posting, DMs, likes or follow actions are implemented. The token is never sent to the browser. API pricing and remaining credits are managed in your X developer account.

Candidate mint strings must resolve to initialized classic SPL mints through a **read-only mainnet RPC**. Token-2022 is outside scope. Ranking uses engagement, not an LLM or a profit prediction. A valid mint is not proof of legitimacy or tradable liquidity. No results or an API error produces an explicit error; it never silently passes fixtures off as live research.

## Enable actual testnet swaps

First build, validate and deploy `veyro-protocol`, then run its testnet bootstrap. No public testnet deployment is bundled or claimed by this repository.

Securely place `deployment.local.json` and the disposable test-only keys from bootstrap on the private volume. Configure:

- `VEYRO_MODE=testnet`
- `SOLANA_RPC_URL=https://api.testnet.solana.com` or a testnet provider
- `VEYRO_DEPLOYMENT_FILE=/app/data/deployment.local.json`
- `VEYRO_KEYS_DIR=/app/data/keys`
- Separate `VEYRO_OPERATOR_TOKEN` and `VEYRO_AGENT_TOKEN`, each at least 32 random characters

This hosted test demo stores separate disposable owner, agent, executor and test-mint admin keys on the server. It is **not production wallet custody**. Never provide a mainnet key. Testnet genesis is checked before execution; the write path rejects mainnet. All funded tokens are valueless TEST-USD/TEST-MEME fixtures, not Circle USDC.

The protocol buys a separate test proxy token, not the mainnet token found on X. Research and execution identities are shown separately in the audit result. The server simulates the actual signed transaction, persists the evaluation and signed bytes before sending, and records finalization separately. Interrupted/unknown transactions can be reconciled with the Activity control. They are not blindly rebuilt and resent.

Owner actions include revocation, replacement policy creation after revocation, and a rate-limited test SOL faucet request for executor fees. Recovery of remaining test quote tokens is supported by the protocol SDK. Do not reset a policy's lifetime spend.

## Chat tools

A stateless JSON-over-HTTP MCP endpoint lives at `/api/mcp`. Configure a client that supports an explicit `Authorization: Bearer <VEYRO_AGENT_TOKEN>` header. Native OAuth discovery, app-store distribution and mobile-wallet integration are not implemented.

Tools:

- `veyro_policy`: read policy and admitted-attempt history.
- `veyro_research`: research an intent using X or explicitly labeled fixtures.
- `veyro_execute`: research and request a purchase under an existing owner policy. Supply a fresh UUID `requestId` per intended action; reuse it when retrying the same action.

Agent credentials cannot create policies, revoke or request faucet funds. The operator credential is separate and must not be given to an autonomous agent. In rehearsal mode use a stable UUID in `x-veyro-session`; live paid X research requires operator authentication.

The tool interface can be driven by an LLM client, but the included browser agent uses deterministic orchestration and ranking. It does not promise financial returns or autonomous portfolio management.

## Develop and validate

This is a pnpm workspace pinned to pnpm 10.17.1, and `npm install` will not
resolve `workspace:*` dependencies. Without pnpm on PATH, `npx pnpm@10.17.1`
works everywhere below.

```sh
npx pnpm@10.17.1 install
npx pnpm@10.17.1 test
npx pnpm@10.17.1 typecheck
npx pnpm@10.17.1 build
npx pnpm@10.17.1 dev
```

`packages/bot/tsconfig.json` currently typechecks `src` only, so a type error
inside a test file will not fail `typecheck` — it surfaces when that test runs.

`vendor/` contains versioned build output from this project's own protocol packages so Railway can build this repository without unpublished packages or GitHub credentials. Update these copies together when protocol interfaces change.

Lifecycle tests use an explicit in-memory store and cover the admitted rehearsal flow, replay prevention, denial reasons, secret redaction and privilege separation. They do not replace a local-validator integration test or on-chain review. Public UI pages reveal configuration status only until a testnet operator/agent authenticates.
