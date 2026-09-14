# Veyro Live

The phone-friendly Veyro agent workspace. Next.js with a monochrome, Vercel-inspired interface; durable Supabase audit records; read-only crypto-X research; protocol execution and a small MCP endpoint.

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

```sh
npm ci
npm test
npm run build
npm run dev
```

`vendor/` contains versioned build output from this project's own protocol packages so Railway can build this repository without unpublished packages or GitHub credentials. Update these copies together when protocol interfaces change.

Lifecycle tests use an explicit in-memory store and cover the admitted rehearsal flow, replay prevention, denial reasons, secret redaction and privilege separation. They do not replace a local-validator integration test or on-chain review. Public UI pages reveal configuration status only until a testnet operator/agent authenticates.
