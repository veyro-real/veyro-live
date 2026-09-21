# Market and Agent Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn live market observations into explainable range/breakout scenarios and bounded campaign proposals, with shadow outcomes for calibration before autonomous execution.

**Architecture:** Deterministic feature functions derive structure, flow, liquidity, and risk from timestamped observations. A restricted model sees only a compact feature packet and can rank allowed actions; schema validation and the campaign guard remain authoritative. Every scored scenario is stored with later outcomes for calibration.

**Tech Stack:** TypeScript, PumpPortal/DexScreener adapters, PostgreSQL, OpenAI-compatible model endpoint, Node market worker.

**Spec:** `docs/superpowers/specs/2026-09-21-telegram-trading-agent-design.md`

## Global Constraints

- Deterministic facts and risk filters run before model inference.
- The MVP strategy is range breakout with liquidity, flow, authority, creator, and concentration gates.
- Model actions are limited to `ENTER`, `WATCH`, `PASS`, `HOLD`, `TIGHTEN`, `TAKE_PROFIT`, and `EXIT`.
- No probability is labeled calibrated until its outcome cohort meets the calibration gate.
- Stale or incomplete data lowers confidence and can block entry; it cannot be silently imputed as favorable.
- The exact feature packet, model response, validation result, policy verdict, and eventual outcome are auditable.

## Review Focus

- Sparse launches with fewer than meaningful float holders must not receive false concentration confidence.
- Duplicate, delayed, or clock-skewed trades must not fabricate volume acceleration or a breakout.
- A liquidity migration between venues must not be mistaken for a rug without corroborating evidence.
- Correlated candidate tokens from one creator must not consume all user slots through independent high scores.
- Model unavailability must preserve deterministic watch/exit behavior and never block a hard exit.

---

### Task 1: Build timestamped range and breakout features

**Files:**
- Create: `packages/bot/src/intelligence/range.ts`
- Create: `packages/bot/src/intelligence/regime.ts`
- Test: `packages/bot/tests/intelligence-range.test.mts`

**Interfaces:**
- Produces: `detectRange(candles,options):RangeStructure|null` and `classifyRegime(input):'RANGE'|'BREAKOUT'|'HEALTHY_PULLBACK'|'DUMP'|'RUG_RISK'|'UNKNOWN'`.

- [ ] **Step 1: Write fixture-driven tests**

Use fixed candle/trade fixtures for three clean range tests, wick-only false breakout, close-plus-volume breakout, bull flag above prior range, accelerating sell dump, liquidity disappearance rug risk, stale input, duplicate trades, and out-of-order trades.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/intelligence-range.test.mts`

Expected: FAIL because range/regime functions are absent.

- [ ] **Step 3: Implement deterministic feature math**

Sort and deduplicate by event ID, use integer timestamps, require a minimum observation count, return evidence fields for every classification, and keep thresholds in a versioned `RangePolicy` object persisted with the score.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/intelligence-range.test.mts`

Expected: PASS with no network access.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/intelligence/range.ts packages/bot/src/intelligence/regime.ts packages/bot/tests/intelligence-range.test.mts
git commit -m "feat: detect token ranges and regimes"
```

### Task 2: Produce primary and alternate scenarios

**Files:**
- Create: `packages/bot/src/intelligence/scenarios.ts`
- Create: `packages/bot/src/intelligence/levels.ts`
- Test: `packages/bot/tests/intelligence-scenarios.test.mts`

**Interfaces:**
- Produces: `buildScenarios(snapshot,structure,policy):ScenarioSet` with exactly two scenarios whose integer `probabilityBps` values sum to 10,000.

- [ ] **Step 1: Write scenario tests**

Test extension levels from the measured range, invalidation below structure, alternative rejection path, rounded basis-point sum, identical-scenario rejection, absent range, zero/negative prices, and qualitative labels when calibration is false.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/intelligence-scenarios.test.mts`

Expected: FAIL because scenario construction is absent.

- [ ] **Step 3: Implement scenario construction**

Use explicit ratio arrays owned by `ScenarioPolicy`; never call them Fibonacci facts in user copy. Include `observed`, `projected`, `invalidation`, `evidence`, `modelVersion`, `policyVersion`, and `calibrated:false`. Emit `UNKNOWN` instead of manufactured targets when inputs fail validation.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/intelligence-scenarios.test.mts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/intelligence/scenarios.ts packages/bot/src/intelligence/levels.ts packages/bot/tests/intelligence-scenarios.test.mts
git commit -m "feat: generate two-path token scenarios"
```

### Task 3: Add bounded discretionary decisions

**Files:**
- Create: `packages/bot/src/intelligence/decision.ts`
- Create: `packages/bot/src/intelligence/schema.ts`
- Test: `packages/bot/tests/intelligence-decision.test.mts`

**Interfaces:**
- Produces: `proposeDecision(packet:DecisionPacket):Promise<DecisionProposal>` where proposal includes one allowed action, confidence basis points, reason codes, and optional size/stop adjustment within packet bounds.

- [ ] **Step 1: Write adversarial response tests**

Test every allowed action, tool-call output, unknown action, markdown, extra fields, prompt-injected symbol/name, oversize adjustment, stop below hard-loss boundary, timeout, and 50 repeated random malformed JSON strings.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/intelligence-decision.test.mts`

Expected: FAIL because decision parsing is absent.

- [ ] **Step 3: Implement the tool-less decision adapter**

Pass only normalized features, allowed actions, numeric bounds, current campaign state, and policy version. Strip token name/social prose from instruction-bearing fields. Reject rather than clamp out-of-bounds monetary changes, then persist the rejected response hash and reason without raw secrets.

- [ ] **Step 4: Run decision and guard tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/intelligence-decision.test.mts tests/campaign-guard.test.mts`

Expected: PASS; guard tests prove valid model output can still be denied.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/intelligence/decision.ts packages/bot/src/intelligence/schema.ts packages/bot/tests/intelligence-decision.test.mts
git commit -m "feat: bound model trading discretion"
```

### Task 4: Store shadow predictions and calculate calibration

**Files:**
- Create: `supabase/migrations/0007_shadow_predictions.sql`
- Create: `packages/bot/src/intelligence/shadow.ts`
- Create: `packages/bot/src/intelligence/calibration.ts`
- Test: `packages/bot/tests/intelligence-calibration.test.mts`

**Interfaces:**
- Produces: `recordPrediction`, `settlePrediction`, and `calibrationReport(cohort):CalibrationReport` with Brier score, bucket accuracy, sample count, and eligibility.

- [ ] **Step 1: Write calibration tests**

Test unsettled exclusion, duplicate settlement, Brier score against a hand-calculated fixture, bucket boundaries, policy/model cohort isolation, and eligibility only at 500 settled predictions spanning at least 14 days with every displayed bucket containing 30 outcomes.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/intelligence-calibration.test.mts`

Expected: FAIL because shadow storage/calculation is absent.

- [ ] **Step 3: Implement append-only predictions**

Store input hash, two scenario probabilities, horizons, versions, and timestamps; settlement appends immutable observed outcomes. Mark a cohort `display_calibrated=true` only when the exact eligibility predicate passes; a new model or policy version starts a new cohort.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/intelligence-calibration.test.mts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_shadow_predictions.sql packages/bot/src/intelligence/shadow.ts packages/bot/src/intelligence/calibration.ts packages/bot/tests/intelligence-calibration.test.mts
git commit -m "feat: calibrate scenario predictions in shadow mode"
```

### Task 5: Wire profile-specific discovery into the market worker

**Files:**
- Modify: `apps/market-worker/src/main.ts`
- Create: `packages/bot/src/intelligence/scanner.ts`
- Modify: `packages/bot/src/strategy/compile.ts`
- Test: `packages/bot/tests/intelligence-scanner.test.mts`

**Interfaces:**
- Produces: `scanForProfiles(candidate,assessment,profiles):Promise<ScanResult[]>`; results are `PASS`, `WATCH`, or a campaign event request, never a direct trade.

- [ ] **Step 1: Write profile and degradation tests**

Test confirm/auto modes, profile filters, creator correlation, full slots, data-provider outage, stale flow, model outage, candidate dedupe, and deterministic result ordering.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/intelligence-scanner.test.mts`

Expected: FAIL because the profile scanner is absent.

- [ ] **Step 3: Implement scanning and campaign event emission**

Compile preferences into versioned numeric policy; run existing rejection filters, structure/scenario derivation, optional decision proposal, and slot check. In shadow mode, persist the hypothetical plan and notify only when profile cadence allows. In live mode, append `OPPORTUNITY_IDENTIFIED`; the campaign worker remains the only executor.

- [ ] **Step 4: Run the intelligence gate**

Run: `pnpm typecheck && pnpm test && pnpm build`

Expected: PASS; recorded fixtures deterministically emit the same scenarios and plans.

- [ ] **Step 5: Commit**

```bash
git add apps/market-worker packages/bot/src/intelligence/scanner.ts packages/bot/src/strategy/compile.ts packages/bot/tests/intelligence-scanner.test.mts
git commit -m "feat: scan market for profile-specific campaigns"
```
