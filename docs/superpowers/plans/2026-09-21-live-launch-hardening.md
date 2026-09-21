# Live Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy, observe, rehearse, and progressively enable the Veyro Telegram agent on Railway without exposing secrets or enabling unrestricted real-money behavior.

**Architecture:** One Railway project deploys the control plane plus Telegram, market, and campaign services from the same immutable image and connects privately to the existing authenticated OpenCode service. Database migrations, secret rotation, webhook registration, smoke tests, shadow operation, and limited live trading are separate auditable gates with an immediate kill switch.

**Tech Stack:** Railway, Docker, pnpm, Supabase/PostgreSQL, Telegram Bot API, Solana/Jupiter, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-21-telegram-trading-agent-design.md`

## Global Constraints

- All `.env*`-writing commands are wrapped with `node ~/.agents/bin/env-guard.mjs run --allow <expected-file> -- <command>`.
- Rotate Telegram bot token, webhook secret, Supabase service role, and credentials-encryption key before real money; rotate the credentials key only while bot-custodied balances are zero.
- Never print secret values; verify only presence, length class, or remote resource identity.
- `VEYRO_TRADING_ENABLED=false` through deployment, migrations, webhook smoke tests, and shadow rehearsal.
- The first live cohort is private chat only, confirm mode only, one active token, and a hard low SOL allowance set by the owner.
- No plan step deposits user funds or expands monetary limits; those remain explicit owner actions.

## Review Focus

- A partial Railway rollout with mixed schema/code versions must fail closed and keep reconciliation available.
- A leaked or stale Telegram webhook secret must reject updates without revealing whether the bot token is valid.
- Provider outages must prevent entries while allowing user exit, hard exits, and reconciliation.
- A kill-switch change must reach every worker and stop new monetary effects within one poll interval.
- Rollback must not run destructive down migrations or lose jobs/events created by the newer version.

---

### Task 1: Add deploy-time configuration validation

**Files:**
- Create: `packages/bot/src/config.ts`
- Create: `packages/bot/src/config-schema.ts`
- Modify: all four application entry points
- Test: `packages/bot/tests/config.test.mts`

**Interfaces:**
- Produces: `loadConfig(service,env):ServiceConfig` with redacted `configSummary()`.

- [ ] **Step 1: Write configuration matrix tests**

Test required variables per service, malformed URLs, short webhook secret, invalid booleans, production local-STT rejection, missing encryption key, missing OpenCode Basic-auth credentials/provider/model, trading enabled without live gate token, and redaction of values containing `TOKEN`, `KEY`, `SECRET`, or `PASSWORD`.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/config.test.mts`

Expected: FAIL because centralized configuration is absent.

- [ ] **Step 3: Implement fail-closed validation**

Allow `VEYRO_TRADING_ENABLED=true` only when `VEYRO_LIVE_GATE=confirmed-private-v1`, `NODE_ENV=production`, database connectivity succeeds, and the campaign worker is the calling service. Other services may observe the flag but cannot construct execution credentials.

- [ ] **Step 4: Run configuration and application tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/config.test.mts && pnpm typecheck`

Expected: PASS and diagnostic output contains names/statuses only.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/config.ts packages/bot/src/config-schema.ts apps packages/bot/tests/config.test.mts
git commit -m "feat: validate service configuration at startup"
```

### Task 2: Add service health, readiness, and global kill switch

**Files:**
- Create: `supabase/migrations/0008_operations.sql`
- Create: `packages/bot/src/operations/gates.ts`
- Modify: `apps/control-plane/app/api/health/route.ts`
- Create: `apps/control-plane/app/api/ready/route.ts`
- Test: `packages/bot/tests/operations-gates.test.mts`

**Interfaces:**
- Produces: `readOperationalGate():Promise<{mode:'DISABLED'|'SHADOW'|'CONFIRM_LIVE';version:number}>` and cached `mayCreateMonetaryEffect()` with a maximum 5-second TTL.

- [ ] **Step 1: Write kill-switch/readiness tests**

Test default disabled, monotonic gate version, five-second cache expiry, database unavailable, stale worker, pending migration, provider degraded, and reconciliation readiness separate from entry readiness.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/operations-gates.test.mts`

Expected: FAIL because operational gates are absent.

- [ ] **Step 3: Implement operations schema and endpoints**

Store one operations row with mode/version/change actor/time/reason and append every change to an audit table. `/health` reports liveness only; `/api/ready` returns 503 unless the service-specific dependencies and migration version are ready. Campaign workers consult the gate immediately before persisting a monetary effect.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/operations-gates.test.mts tests/health.test.mts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_operations.sql packages/bot/src/operations apps/control-plane/app/api packages/bot/tests/operations-gates.test.mts
git commit -m "feat: add live gate and kill switch"
```

### Task 3: Define Railway services and release commands

**Files:**
- Modify: `railway.json`
- Create: `scripts/check-migrations.mts`
- Create: `scripts/register-telegram-webhook.mts`
- Create: `docs/operations/railway-release.md`
- Test: `packages/bot/tests/release-scripts.test.mts`

**Interfaces:**
- Railway services use `SERVICE=control-plane|telegram-worker|market-worker|campaign-worker` from one image.
- Webhook registration accepts `PUBLIC_BASE_URL` and uses `TELEGRAM_WEBHOOK_SECRET` as `secret_token`.

- [ ] **Step 1: Write release-script tests with fake HTTP/database ports**

Test exact webhook URL `/api/telegram/webhook`, allowed updates, secret header registration, no secret in output, idempotent registration, expected migration `0008`, and refusal to deploy code ahead of schema.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/release-scripts.test.mts`

Expected: FAIL because release scripts are absent.

- [ ] **Step 3: Implement release scripts and runbook**

The runbook names four bot services, their `SERVICE` values, restart policy, readiness URL for the control plane, heartbeat checks for workers, the existing OpenCode service's private URL and `/global/health` check, exact migration order `0004`–`0008`, webhook verification through `getWebhookInfo`, and rollback to the previous image without schema reversal.

- [ ] **Step 4: Run repository and dry-run checks**

Run: `pnpm typecheck && pnpm test && pnpm build`

Run: `pnpm exec tsx scripts/register-telegram-webhook.mts --dry-run`

Expected: PASS; dry run prints the URL and allowed update types but no token or webhook secret.

- [ ] **Step 5: Commit**

```bash
git add railway.json scripts/check-migrations.mts scripts/register-telegram-webhook.mts docs/operations/railway-release.md packages/bot/tests/release-scripts.test.mts
git commit -m "ops: define Railway bot release"
```

### Task 4: Add an automated end-to-end rehearsal

**Files:**
- Create: `packages/bot/tests/e2e/rehearsal.test.mts`
- Create: `packages/bot/tests/e2e/fixtures.ts`
- Create: `scripts/rehearse-shadow.mts`
- Create: `docs/operations/rehearsal-evidence.md`

**Interfaces:**
- Produces: a JSON rehearsal report containing update ID, job ID, transcript hash, intent, pending action ID, campaign ID, event IDs, effect IDs, scenario ID, visual job ID, and final state; it contains no secrets or raw audio.

- [ ] **Step 1: Write the end-to-end fixture**

Drive a fake voice update through webhook enqueue, lease, hosted STT fake, intent proposal, confirmation callback, opportunity event, guarded shadow entry, simulated fill, principal recovery, runner trail, final exit, scenario chart, and one celebration. Add duplicate delivery and worker-crash injections.

- [ ] **Step 2: Run and verify the fixture fails**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/e2e/rehearsal.test.mts`

Expected: FAIL until every prior plan has supplied its interfaces.

- [ ] **Step 3: Implement the rehearsal runner**

Use fake Telegram/model/STT/Jupiter ports and a disposable database schema; assert no network request escapes. Hash transcript text in the exported report and redact environment-like strings.

- [ ] **Step 4: Run the complete rehearsal twice**

Run: `pnpm exec tsx scripts/rehearse-shadow.mts --seed 20260921`

Run: `pnpm exec tsx scripts/rehearse-shadow.mts --seed 20260921`

Expected: both reports contain identical decisions and exactly one effect per idempotency key; all repository tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/tests/e2e scripts/rehearse-shadow.mts docs/operations/rehearsal-evidence.md
git commit -m "test: rehearse Telegram campaign end to end"
```

### Task 5: Deploy disabled and complete production smoke tests

**Files:**
- Create: `docs/operations/production-smoke-checklist.md`
- Modify: `docs/operations/railway-release.md`

**Interfaces:**
- Consumes: authenticated Railway project, Supabase project, Telegram bot, and provider credentials supplied by the owner.
- Produces: four healthy Railway services with mode `DISABLED`, registered webhook, and recorded non-monetary smoke evidence.

- [ ] **Step 1: Snapshot and verify the local tree**

Run: `git status --short && pnpm typecheck && pnpm test && pnpm build`

Expected: only intentional tracked changes; all checks PASS.

- [ ] **Step 2: Rotate/configure credentials without exposing them**

Wrap any CLI that can touch dotenv files with the env guard. Verify credential presence through remote variable names only. Keep `VEYRO_TRADING_ENABLED=false` and operations mode `DISABLED`; do not rotate `VEYRO_CREDENTIALS_KEY` unless all custodied wallet balances are confirmed zero.

- [ ] **Step 3: Apply migrations and deploy all services**

Run the guarded Railway/Supabase commands documented in `railway-release.md`, then record deployment IDs and migration versions in the checklist. Do not use destructive schema commands.

- [ ] **Step 4: Register webhook and run no-money smoke tests**

Verify `getWebhookInfo`, `/help`, a text scan request, a voice-note transcription, a rejected stale callback, a Hot Board open, worker heartbeats, duplicate update suppression, and image-provider fallback. Query audit records to prove no monetary effect exists.

- [ ] **Step 5: Commit redacted operational evidence**

```bash
git add docs/operations/production-smoke-checklist.md docs/operations/railway-release.md
git commit -m "ops: record disabled production smoke test"
```

### Task 6: Run shadow mode and evaluate the launch gate

**Files:**
- Create: `docs/operations/shadow-launch-report.md`
- Create: `scripts/shadow-report.mts`
- Test: `packages/bot/tests/shadow-report.test.mts`

**Interfaces:**
- Produces a redacted report for at least 72 continuous hours with uptime, update latency, dead jobs, duplicate suppression, candidates, plans, denied plans, simulated slippage, scenario outcomes, and hypothetical drawdown.

- [ ] **Step 1: Write report acceptance tests**

Reject windows under 72 hours, any dead monetary job, missing hard-exit simulation, update p95 over 10 seconds, unresolved unknown execution, or absent provider-outage drill. Require all rates to include numerator/denominator.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/shadow-report.test.mts`

Expected: FAIL because report generation is absent.

- [ ] **Step 3: Implement and run shadow reporting**

Set operations mode `SHADOW`; keep trading env false. Generate the report from audit tables, run Telegram/STT/model/market outage drills one at a time, and record recovery time. The script returns nonzero if any launch predicate fails.

- [ ] **Step 4: Review the shadow evidence with the owner**

Present the report, denied-plan examples, hypothetical worst loss, and calibration status. Do not enable trading from this step; owner approval and explicit monetary limits are required.

- [ ] **Step 5: Commit the redacted report**

```bash
git add scripts/shadow-report.mts packages/bot/tests/shadow-report.test.mts docs/operations/shadow-launch-report.md
git commit -m "ops: evaluate Veyro shadow launch"
```

### Task 7: Enable a restricted confirm-only live cohort

**Files:**
- Create: `docs/operations/limited-live-checklist.md`
- Create: `docs/operations/incident-response.md`

**Interfaces:**
- Consumes: explicit owner approval, funded test wallet, owner-chosen max trade/daily cap/expiry, passing shadow report, and zero unresolved executions.
- Produces: private-chat confirm-only live operation for one user and one active campaign slot.

- [ ] **Step 1: Verify hard preconditions**

Record the approved user ID hash, free tier, one-slot limit, expiry, max trade, daily cap, wallet balance, kill-switch procedure, and passing report commit. Abort if any value is absent or if auto mode is enabled.

- [ ] **Step 2: Enable the narrow gate**

Set `VEYRO_TRADING_ENABLED=true`, `VEYRO_LIVE_GATE=confirmed-private-v1`, and operations mode `CONFIRM_LIVE` only for the campaign worker. Confirm other services cannot load signing credentials.

- [ ] **Step 3: Execute one owner-confirmed minimum-size campaign**

Verify proposed amount, fresh quote, explicit Telegram confirmation, signature, confirmed token delta, audit chain, campaign snapshot, exit controls, and real-time kill-switch visibility. Do not open a second token.

- [ ] **Step 4: Reconcile and test exit/kill switch**

Exercise a partial exit if inventory economics permit, then close the campaign or retain only the policy-authorized moonbag. Flip operations mode to `DISABLED` and confirm new effects stop within five seconds while reconciliation still completes.

- [ ] **Step 5: Record evidence and decide whether to remain live**

Commit only redacted transaction explorer links, event IDs, latencies, accounting reconciliation, and issues. Leave the gate disabled if any discrepancy exists; expansion to auto mode or additional tiers requires a separate reviewed plan.

```bash
git add docs/operations/limited-live-checklist.md docs/operations/incident-response.md
git commit -m "ops: record restricted live launch"
```
