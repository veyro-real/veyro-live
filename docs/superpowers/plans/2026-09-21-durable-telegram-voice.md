# Durable Telegram and Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept Telegram updates quickly and exactly once into a durable queue, then process text, callbacks, and voice notes asynchronously with structured model-assisted intent.

**Architecture:** A PostgreSQL RPC atomically deduplicates and enqueues each webhook update. A leased Telegram worker routes jobs through existing handlers; voice uses an OpenAI-compatible hosted transcription port, and the model can propose only a schema-validated intent that existing confirmation rules must approve.

**Tech Stack:** TypeScript, Supabase/PostgreSQL, Telegram Bot API, OpenAI-compatible HTTP APIs, Node workers.

**Spec:** `docs/superpowers/specs/2026-09-21-telegram-trading-agent-design.md`

## Global Constraints

- Webhook work is limited to secret verification, body validation, atomic enqueue, and a response within 2 seconds.
- Store Telegram `update_id` uniquely; redelivery cannot create a second job.
- Reject bodies larger than 1 MiB and voice files larger than 20 MiB.
- Delete raw voice bytes after transcription; persist transcript and intent audit, not audio.
- Model output is untrusted JSON and cannot execute an action or bypass confirmation/auto-mode policy.
- Never send wallet material, credentials, unrelated chat history, or raw Telegram payloads to the model.

## Review Focus

- A crash after lease acquisition must make the job available again after lease expiry.
- Telegram redelivery while the first job is running must return success without creating a second job.
- STT timeouts and malformed transcripts must produce a retry-safe user message, not a silent loop.
- Callback queries with stale or already-consumed action IDs must be answered but not executed.
- A model response containing unknown keys, excessive size, or a disallowed action must fall back to deterministic parsing.

---

### Task 1: Add atomic Telegram job ingestion

**Files:**
- Create: `supabase/migrations/0004_telegram_jobs.sql`
- Create: `packages/bot/src/telegram/jobs.ts`
- Modify: `packages/bot/src/telegram/webhook.ts`
- Test: `packages/bot/tests/telegram-jobs.test.mts`
- Test: `packages/bot/tests/telegram-webhook.test.mts`

**Interfaces:**
- Produces: `acceptTelegramUpdate(update: TelegramUpdate): Promise<'ACCEPTED'|'DUPLICATE'>`.
- Produces: `claimTelegramJobs(workerId:string, limit:number, leaseSeconds:number): Promise<TelegramJob[]>` and `finishTelegramJob(id:string, outcome:'DONE'|'RETRY'|'DEAD', error?:string): Promise<void>`.

- [ ] **Step 1: Write failing atomicity tests**

```ts
test('duplicate update creates one job',async()=>{
 assert.equal(await store.accept(update),'ACCEPTED');
 assert.equal(await store.accept(update),'DUPLICATE');
 assert.equal(await store.count(),1);
});
test('expired lease can be reclaimed',async()=>{
 const [first]=await store.claim('a',1,1);
 clock.advance(1001);
 const [second]=await store.claim('b',1,1);
 assert.equal(second.id,first.id);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/telegram-jobs.test.mts tests/telegram-webhook.test.mts`

Expected: FAIL because the job store and acceptance RPC do not exist.

- [ ] **Step 3: Implement schema and store**

Create `veyro_telegram_jobs(id uuid, update_id bigint unique, payload jsonb, status text, attempts int, available_at timestamptz, leased_until timestamptz, worker_id text, last_error text, created_at timestamptz, finished_at timestamptz)`. Add `veyro_accept_telegram_update(bigint,jsonb)` using `insert ... on conflict do nothing`; add a `security definer` lease RPC using `for update skip locked`, capped at 25 rows and a 5–300 second lease. Change the webhook to call only `acceptTelegramUpdate` after existing secret/body validation.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/telegram-jobs.test.mts tests/telegram-webhook.test.mts`

Expected: PASS, including a test asserting the router has not run when the webhook responds.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_telegram_jobs.sql packages/bot/src/telegram/jobs.ts packages/bot/src/telegram/webhook.ts packages/bot/tests/telegram-jobs.test.mts packages/bot/tests/telegram-webhook.test.mts
git commit -m "feat: enqueue Telegram updates atomically"
```

### Task 2: Run the durable Telegram worker

**Files:**
- Modify: `apps/telegram-worker/src/main.ts`
- Create: `packages/bot/src/telegram/worker.ts`
- Test: `packages/bot/tests/telegram-worker.test.mts`

**Interfaces:**
- Consumes: `claimTelegramJobs`, existing `route(update,deps)`, and `finishTelegramJob`.
- Produces: `runTelegramBatch(deps, workerId): Promise<{done:number;retried:number;dead:number}>`.

- [ ] **Step 1: Write failing worker tests**

Test that success marks `DONE`, a thrown transient error schedules exponential retry at `min(300, 2**attempts)` seconds, the eighth failure marks `DEAD` and sends one operator-safe diagnostic, and `SIGTERM` stops claiming before waiting for the active batch.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/telegram-worker.test.mts`

Expected: FAIL because `runTelegramBatch` is missing.

- [ ] **Step 3: Implement the batch loop**

Use a random UUID worker ID, a batch size of 10, a 60-second lease, an `AbortController`, and a 500 ms empty-queue delay. Classify Telegram 429/5xx, network failures, and STT timeouts as retryable; classify invalid payloads and unsupported update shapes as done after a user-safe response.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/telegram-worker.test.mts && pnpm --filter @veyro/telegram-worker typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/telegram-worker packages/bot/src/telegram/worker.ts packages/bot/tests/telegram-worker.test.mts
git commit -m "feat: process Telegram jobs durably"
```

### Task 3: Replace host-local speech transcription with a hosted port

**Files:**
- Create: `packages/bot/src/voice/hosted-transcriber.ts`
- Modify: `packages/bot/src/voice/transcribe.ts`
- Modify: `packages/bot/src/telegram/ports.ts`
- Test: `packages/bot/tests/voice-hosted-transcriber.test.mts`

**Interfaces:**
- Produces: `hostedTranscriber({baseUrl,apiKey,model,fetch,timeoutMs}): Transcriber` where `Transcriber.transcribe(audio:Buffer, mimeType:string):Promise<string>`.

- [ ] **Step 1: Write failing adapter tests**

Test multipart field names `file` and `model`, bearer authentication, 30-second default timeout, 20 MiB rejection before HTTP, whitespace normalization, non-2xx error classification without response-body leakage, and empty transcript rejection.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/voice-hosted-transcriber.test.mts`

Expected: FAIL because `hostedTranscriber` is missing.

- [ ] **Step 3: Implement the OpenAI-compatible adapter**

POST `FormData` to `${baseUrl}/audio/transcriptions`; parse `{text:string}`; throw only `STT_TOO_LARGE`, `STT_TIMEOUT`, `STT_UNAVAILABLE`, or `STT_EMPTY`. Select hosted transcription on Railway and retain the existing whisper.cpp adapter only when `VEYRO_STT_PROVIDER=local`.

- [ ] **Step 4: Run voice and router suites**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/voice-hosted-transcriber.test.mts tests/voice-transcribe.test.mts tests/telegram-router.test.mts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/voice packages/bot/src/telegram/ports.ts packages/bot/tests/voice-hosted-transcriber.test.mts
git commit -m "feat: transcribe Telegram voice with hosted STT"
```

### Task 4: Add schema-validated model intent proposals

**Files:**
- Create: `packages/bot/src/intelligence/client.ts`
- Create: `packages/bot/src/intelligence/opencode-client.ts`
- Create: `packages/bot/src/telegram/intent-agent.ts`
- Create: `opencode.json`
- Create: `.opencode/agents/veyro-decision.md`
- Modify: `packages/bot/src/telegram/router.ts`
- Test: `packages/bot/tests/telegram-intent-agent.test.mts`

**Interfaces:**
- Produces: `proposeIntent(text:string, context:IntentContext): Promise<IntentProposal>`.
- Produces: `opencodeDecisionClient({baseUrl,username,password,providerID,modelID,fetch}): DecisionClient` backed by the existing Railway OpenCode service.
- `IntentProposal` is `{action:'BUY'|'SELL'|'SCAN'|'POSITIONS'|'SET_STRATEGY'|'SET_LIMITS'|'HELP'|'UNKNOWN'; confidence:number; args:Record<string,string>; summary:string}`.

- [ ] **Step 1: Write failing validation tests**

Test OpenCode health failure, HTTP Basic authentication, ephemeral session creation/deletion, the exact configured provider/model and `veyro-decision` agent, a valid buy proposal, fenced JSON, unknown action, extra key, `NaN` confidence, response over 16 KiB, timeout, prompt-injection text, and fallback to existing `intentFromSpeech` on every invalid result.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/telegram-intent-agent.test.mts`

Expected: FAIL because the model port is missing.

- [ ] **Step 3: Implement the restricted client and parser**

Use `@opencode-ai/sdk` against the existing service: check `GET /global/health`, create a session, call `session.prompt` with `{agent:'veyro-decision',model:{providerID,modelID},parts:[{type:'text',text}]}`, extract text parts, and delete the session in `finally`. Protect it with HTTP Basic auth. Configure `veyro-decision` with `temperature: 0`, one step, and `permission: {"*":"deny"}` so it cannot read files, browse, spawn tasks, or run commands. The system prompt must state the exact enum and require one JSON object. Parse with explicit key checks; require `0 <= confidence <= 1`; cap input at 8,000 characters and output at 16 KiB. The router treats model output as a proposal and continues through the existing pending-action confirmation path.

- [ ] **Step 4: Run intent, voice, and callback suites**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/telegram-intent.test.mts tests/telegram-intent-agent.test.mts tests/telegram-router.test.mts`

Expected: PASS; no test observes a trade before confirmation.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/intelligence packages/bot/src/telegram/intent-agent.ts packages/bot/src/telegram/router.ts opencode.json .opencode/agents/veyro-decision.md packages/bot/tests/telegram-intent-agent.test.mts
git commit -m "feat: propose voice actions with bounded model intent"
```

### Task 5: Schedule respectful proactive Telegram prompts

**Files:**
- Create: `supabase/migrations/0005_chat_profiles.sql`
- Create: `packages/bot/src/telegram/engagement.ts`
- Modify: `packages/bot/src/telegram/worker.ts`
- Test: `packages/bot/tests/telegram-engagement.test.mts`

**Interfaces:**
- Produces: `dueEngagements(now,profiles,activity,opportunities):EngagementProposal[]` and `recordEngagementOutcome(proposalId,outcome):Promise<void>`.
- Persists one profile per Telegram chat/thread identity with timezone, quiet hours, cadence, tone, execution mode, tier, last activity, and opt-out state.

- [ ] **Step 1: Write failing cadence and consent tests**

Test private chat identity, future group/thread identity, quiet hours crossing midnight, unknown timezone, explicit mute, maximum two unsolicited prompts per local day, at least four hours between prompts, recent user activity preference, no qualified opportunity, losing-day tone, duplicate scheduler tick, and a user response updating activity without creating a trade.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/telegram-engagement.test.mts`

Expected: FAIL because profile storage and engagement scheduling do not exist.

- [ ] **Step 3: Implement profile-aware scheduling**

Add `veyro_chat_profiles` and `veyro_engagement_events` with unique `(chat_id,thread_id)` identity and proposal idempotency. Default to muted proactive messaging until the user opts in. Select only measured opportunities already produced by the scanner; use account outcomes to choose factual, non-loss-chasing copy. The scheduler enqueues a normal Telegram job and never calls execution code.

- [ ] **Step 4: Run engagement and worker tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/telegram-engagement.test.mts tests/telegram-worker.test.mts`

Expected: PASS; duplicate ticks produce one prompt and quiet-hour profiles produce none.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_chat_profiles.sql packages/bot/src/telegram/engagement.ts packages/bot/src/telegram/worker.ts packages/bot/tests/telegram-engagement.test.mts
git commit -m "feat: schedule profile-aware Telegram prompts"
```

### Task 6: Expose operational health and finish the service

**Files:**
- Create: `packages/bot/src/worker/heartbeat.ts`
- Modify: `apps/telegram-worker/src/main.ts`
- Modify: `apps/control-plane/app/api/health/route.ts`
- Create: `docs/operations/telegram-worker.md`
- Test: `packages/bot/tests/telegram-worker-health.test.mts`

**Interfaces:**
- Produces: heartbeat key `worker:telegram` with `{workerId,lastClaimAt,lastSuccessAt,lastErrorAt,version}`.
- Health response reports `telegramWorker: 'ok'|'stale'|'missing'` without leaking errors or credentials.

- [ ] **Step 1: Write failing freshness tests**

Test `ok` under 90 seconds, `stale` at 90 seconds or older, `missing` with no heartbeat, and sanitized error storage.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/telegram-worker-health.test.mts`

Expected: FAIL because the heartbeat adapter is missing.

- [ ] **Step 3: Implement heartbeat and runbook**

Write a heartbeat after each poll and expose only status/age. Document required variables `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `VEYRO_STT_BASE_URL`, `VEYRO_STT_API_KEY`, `VEYRO_STT_MODEL`, `VEYRO_OPENCODE_BASE_URL`, `VEYRO_OPENCODE_USERNAME`, `VEYRO_OPENCODE_PASSWORD`, `VEYRO_OPENCODE_PROVIDER_ID`, and `VEYRO_OPENCODE_MODEL_ID`, plus the exact no-trading smoke test using `/help` and a voice note.

- [ ] **Step 4: Run the durable Telegram gate**

Run: `pnpm typecheck && pnpm test && pnpm build`

Expected: PASS with `VEYRO_TRADING_ENABLED=false`.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/worker apps/telegram-worker apps/control-plane/app/api/health docs/operations/telegram-worker.md packages/bot/tests/telegram-worker-health.test.mts
git commit -m "feat: monitor durable Telegram processing"
```
