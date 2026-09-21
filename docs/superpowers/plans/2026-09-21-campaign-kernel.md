# Campaign Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manage each token play as an auditable state machine that can enter, recover principal, trail a runner, retain a moonbag, and close or dust safely.

**Architecture:** An append-only event stream feeds a pure reducer; an outbox stores authorized effects; leases serialize each campaign. The model may propose a transition, while a deterministic plan guard checks user mode, tier slots, spend limits, position inventory, quote freshness, and campaign invariants before an effect reaches existing execution code.

**Tech Stack:** TypeScript pure reducers, PostgreSQL/Supabase, Jupiter execution, Node campaign worker.

**Spec:** `docs/superpowers/specs/2026-09-21-telegram-trading-agent-design.md`

## Global Constraints

- Campaign states are `WATCHING`, `ENTRY_PROPOSED`, `ENTERING`, `OPEN`, `PRINCIPAL_RECOVERY`, `RUNNER`, `EXITING`, `MOONBAG`, `CLOSED`, `DUSTED`, `PAUSED`, and `ERROR`.
- Every transition is caused by a persisted event and produces zero or more declarative effects.
- Free/paid/pro tiers enforce 1/3/15 active token slots atomically.
- Total tokens sold by all fills cannot exceed tokens acquired; recovered principal and realized profit derive from fills, not price estimates.
- Soft stops may be deferred only inside explicit structural bounds; hard-loss, rug, stale-data, revoked-limit, and user-exit rules cannot be overridden.
- Reconciliation is always available even when new trading is disabled.

## Review Focus

- Concurrent entry proposals for the last available slot must yield exactly one reservation.
- Partial fills and transfer-fee tokens must update remaining inventory from confirmed deltas rather than quote amounts.
- A crash between swap broadcast and event append must reconcile the signature without a duplicate sell.
- Out-of-order or duplicate market events must not rewind campaign peak, state, or accounting.
- Dust cleanup must never sell a viable moonbag merely because its display value is temporarily unavailable.

---

### Task 1: Define the pure campaign reducer

**Files:**
- Create: `packages/bot/src/campaign/types.ts`
- Create: `packages/bot/src/campaign/reducer.ts`
- Test: `packages/bot/tests/campaign-reducer.test.mts`

**Interfaces:**
- Produces: `reduceCampaign(state:CampaignState,event:CampaignEvent): {state:CampaignState;effects:CampaignEffect[]}`.
- `CampaignEffect` is a discriminated union of `REQUEST_ENTRY`, `REQUEST_EXIT`, `NOTIFY`, `SCHEDULE_REVIEW`, and `NONE`; effects contain no credentials or executable callbacks.

- [ ] **Step 1: Write the state-table tests**

Table-drive valid and invalid transitions, duplicate event IDs, monotonic `peakPrice`, `ENTRY_FILLED -> OPEN`, target reach into `PRINCIPAL_RECOVERY`, confirmed principal sale into `RUNNER`, rug into `EXITING`, retained remainder into `MOONBAG`, zero remainder into `CLOSED`, and failed effects into `ERROR` without losing the prior inventory snapshot.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/campaign-reducer.test.mts`

Expected: FAIL because campaign types and reducer are absent.

- [ ] **Step 3: Implement immutable state reduction**

Represent atomic amounts as decimal strings at persistence boundaries and `bigint` during reduction. Reject unknown events and transitions with `{code:'INVALID_TRANSITION',state,eventType}`; do not silently coerce. Keep `lastEventId`, `version`, acquired/sold/remaining token atoms, spent/recovered/realized lamports, entry/peak/current price, stop levels, and timestamps in state.

- [ ] **Step 4: Run reducer tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/campaign-reducer.test.mts`

Expected: PASS, including property-style loops asserting `sold <= acquired` and nondecreasing recovered lamports.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/campaign packages/bot/tests/campaign-reducer.test.mts
git commit -m "feat: define token campaign state machine"
```

### Task 2: Persist events, snapshots, effects, and tier slots

**Files:**
- Create: `supabase/migrations/0006_campaign_kernel.sql`
- Create: `packages/bot/src/campaign/store.ts`
- Test: `packages/bot/tests/campaign-store.test.mts`

**Interfaces:**
- Produces: `appendCampaignEvent(campaignId,expectedVersion,event,effects):Promise<CampaignState>`.
- Produces: `reserveCampaignSlot(userId,tier,mint):Promise<'RESERVED'|'EXISTS'|'LIMIT_REACHED'>` and `releaseCampaignSlot(campaignId):Promise<void>`.

- [ ] **Step 1: Write failing concurrency/store tests**

Test optimistic-version conflict, same `event.id` idempotency, atomic event/snapshot/outbox commit, `skip locked` effect lease, and 20 simultaneous free-tier slot claims producing one reservation.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/campaign-store.test.mts`

Expected: FAIL because the campaign tables/RPCs do not exist.

- [ ] **Step 3: Implement the ledger schema**

Add `veyro_campaigns`, `veyro_campaign_events`, `veyro_campaign_effects`, `veyro_campaign_slots`, and `veyro_exit_attempts`; enforce unique `(campaign_id,event_id)`, unique open `(user_id,mint)`, nonnegative accounting checks, and tier values. Use transaction-scoped advisory lock on `user_id` for slot count plus insert. Grant execution only to service role. Exit attempts have a unique idempotency key, optional signature, requested/confirmed token atoms, confirmed SOL atoms, and status so Task 3 never overwrites earlier partial fills.

- [ ] **Step 4: Run store and migration tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/campaign-store.test.mts`

Expected: PASS with rollback proving no event survives if effect insertion fails.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_campaign_kernel.sql packages/bot/src/campaign/store.ts packages/bot/tests/campaign-store.test.mts
git commit -m "feat: persist campaign event ledger"
```

### Task 3: Add partial execution and fill-derived accounting

**Files:**
- Modify: `packages/bot/src/types.ts`
- Modify: `packages/bot/src/trade/execute.ts`
- Modify: `packages/bot/src/trade/jupiter.ts`
- Create: `packages/bot/src/trade/fills.ts`
- Test: `packages/bot/tests/trade-partial-exit.test.mts`

**Interfaces:**
- Produces: `sellAmount(userId,positionId,tokenAtoms,key):Promise<TradeOutcome>`.
- Produces: `readSwapFill(signature,owner,inputMint,outputMint):Promise<{inputAtoms:string;outputAtoms:string}>`.

- [ ] **Step 1: Write failing partial-exit tests**

Test a 50% sell leaves the position open with exact remaining atoms, a second idempotent request does not resell, over-sell rejects, zero rejects, confirmed chain deltas override quote amounts, and uncertain broadcast marks the exit attempt unknown for reconciliation.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/trade-partial-exit.test.mts`

Expected: FAIL because only full-position `sell` exists.

- [ ] **Step 3: Implement partial exit attempts**

Store exit attempts separately from the position so multiple confirmed partial exits retain signatures and amounts. Lock the position during amount validation. Preserve `sell(...)` as a wrapper calling `sellAmount` with all remaining atoms. Update campaign accounting only from `readSwapFill` confirmed balance deltas.

- [ ] **Step 4: Run trade and reconciliation tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/trade-partial-exit.test.mts tests/workflow.test.mts`

Expected: PASS and existing full-exit behavior remains compatible.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/types.ts packages/bot/src/trade packages/bot/tests/trade-partial-exit.test.mts
git commit -m "feat: execute and reconcile partial exits"
```

### Task 4: Enforce plans through the deterministic guard

**Files:**
- Create: `packages/bot/src/campaign/plan.ts`
- Create: `packages/bot/src/campaign/guard.ts`
- Test: `packages/bot/tests/campaign-guard.test.mts`

**Interfaces:**
- Produces: `authorizePlan(plan:TradePlan,context:GuardContext): GuardVerdict` where verdict is `{decision:'ALLOW';normalized:TradePlan}` or `{decision:'DENY';reasons:GuardDenial[]}`.

- [ ] **Step 1: Write the guard matrix**

Cover expired plan, wrong campaign version, confirm-mode without approval, auto-mode within bounds, tier exhaustion, inactive/expired limits, trade/daily cap, insufficient balance/inventory, stale quote over 15 seconds, slippage over user cap, liquidity floor, hard-stop exit, model-requested oversize normalization denial, and allowed soft-stop deferral inside its maximum time/price envelope.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/campaign-guard.test.mts`

Expected: FAIL because the guard is absent.

- [ ] **Step 3: Implement total, deterministic authorization**

The guard has no network or database calls. Require all context fields explicitly, return every applicable denial in stable order, and hash canonical plan JSON for the effect idempotency key. Hard exits ignore model preference but still require inventory and quote sanity.

- [ ] **Step 4: Run guard tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/campaign-guard.test.mts`

Expected: PASS with 100% branch coverage for `guard.ts` under `c8`.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/campaign/plan.ts packages/bot/src/campaign/guard.ts packages/bot/tests/campaign-guard.test.mts
git commit -m "feat: guard every campaign trade plan"
```

### Task 5: Execute campaign effects and reconcile crashes

**Files:**
- Create: `packages/bot/src/campaign/worker.ts`
- Modify: `apps/campaign-worker/src/main.ts`
- Test: `packages/bot/tests/campaign-worker.test.mts`

**Interfaces:**
- Consumes: effect leases, `authorizePlan`, `buy`, `sellAmount`, fill reader, reducer, and append RPC.
- Produces: `runCampaignBatch(deps,workerId):Promise<CampaignBatchResult>`.

- [ ] **Step 1: Write failure-injection tests**

Inject crashes before broadcast, after broadcast, after confirmation, and after event append. Assert retries never rebroadcast a known signature; unknown attempts enter reconciliation; duplicate effects are no-ops; hard exits continue when new buys are disabled.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/campaign-worker.test.mts`

Expected: FAIL because the effect worker is absent.

- [ ] **Step 3: Implement leased effect execution**

Claim at most 10 effects for 60 seconds, load fresh context, authorize, persist denial or execution-start before side effects, pass the effect ID as execution idempotency key, append the confirmed fill event, and mark the effect complete in the same database transaction as the new snapshot/outbox effects.

- [ ] **Step 4: Run the campaign gate**

Run: `pnpm typecheck && pnpm test && pnpm build`

Expected: PASS with trading disabled; a deterministic fixture reaches `RUNNER` after entry and principal recovery.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/campaign/worker.ts apps/campaign-worker packages/bot/tests/campaign-worker.test.mts
git commit -m "feat: run and reconcile campaign effects"
```

### Task 6: Manage re-entry, moonbags, and dead-token cleanup

**Files:**
- Create: `packages/bot/src/campaign/lifecycle.ts`
- Modify: `packages/bot/src/campaign/reducer.ts`
- Modify: `packages/bot/src/campaign/guard.ts`
- Test: `packages/bot/tests/campaign-lifecycle.test.mts`

**Interfaces:**
- Produces: `evaluateLifecycle(state,market,policy):CampaignEvent[]` for re-entry, moonbag retention, dusting, and slot release.

- [ ] **Step 1: Write lifecycle policy tests**

Test a profitable runner re-adding only from realized profit, maximum one add per structure version, no add that can reduce realized profit below zero, no add after hard-risk/rug evidence, viable momentum moonbag retention, renewed breakout review, confirmed rug/dead-liquidity full cleanup, unknown price/liquidity preservation, minimum sellable amount, slot retained by a viable moonbag, and slot released only by `CLOSED` or `DUSTED`.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/campaign-lifecycle.test.mts`

Expected: FAIL because lifecycle evaluation is absent.

- [ ] **Step 3: Implement bounded lifecycle rules**

Calculate re-entry budget as the lesser of policy allowance and confirmed realized profit not already re-risked. Require a new structure ID plus fresh guard authorization. Dust only when deterministic rug/dead-token signals meet the policy quorum and a sell quote exists; otherwise pause for review. Release the slot in the same transaction that appends the terminal state event.

- [ ] **Step 4: Run lifecycle, reducer, and guard tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/campaign-lifecycle.test.mts tests/campaign-reducer.test.mts tests/campaign-guard.test.mts`

Expected: PASS; no generated event can make sold tokens exceed acquired tokens or realized profit negative through re-entry accounting.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/campaign/lifecycle.ts packages/bot/src/campaign/reducer.ts packages/bot/src/campaign/guard.ts packages/bot/tests/campaign-lifecycle.test.mts
git commit -m "feat: manage campaign re-entry and cleanup"
```
