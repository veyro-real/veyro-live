# Telegram Visual and Hype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver compact Telegram action cards, token-logo scenario charts, a 16-token Hot Board, detailed token review, and factual win celebrations with high-energy visual character.

**Architecture:** Financial visuals render deterministically from typed view models into SVG/PNG. Telegram messages use stable callback IDs and optional Mini App links. Decorative hype backgrounds may come from a hosted image endpoint, but factual overlays and eligibility are controlled by code.

**Tech Stack:** Telegram Bot API, Next.js, Satori, `@resvg/resvg-js`, React, optional hosted image generation.

**Spec:** `docs/superpowers/specs/2026-09-21-telegram-trading-agent-design.md`

## Global Constraints

- Token logo and ticker appear together; untrusted remote logos are fetched through a size/type/time-limited proxy with a deterministic fallback.
- Scenario charts show observed price, primary projection, alternate projection, invalidation, and probabilities/qualitative confidence.
- Hot Board contains at most 16 tokens and uses consistent labels rather than fabricated certainty.
- Buttons remain explicit: confirm mode cannot use ambiguous copy for monetary actions.
- Celebrate confirmed realized wins and meaningful campaign milestones; never celebrate deposits, unrealized spikes, churn, or losses as wins.
- Generated imagery cannot contain authoritative prices, P&L, probabilities, or action labels; deterministic overlays own those facts.

## Review Focus

- Malicious SVG logos, oversized images, and slow logo hosts must fall back without blocking a Telegram response.
- Telegram callback data must stay under 64 bytes and stale actions must fail closed.
- Very long tickers, negative P&L, and 10-digit percentages must not overflow a chart/card.
- Image-generation outage must use a deterministic celebration template rather than suppressing a valid milestone.
- Replayed fill events must not post the same celebration twice.

---

### Task 1: Extend Telegram cards and web-app buttons

**Files:**
- Modify: `packages/bot/src/telegram/types.ts`
- Modify: `packages/bot/src/telegram/api.ts`
- Create: `packages/bot/src/telegram/cards.ts`
- Test: `packages/bot/tests/telegram-cards.test.mts`

**Interfaces:**
- `InlineButton` becomes `{text:string;callback_data:string}|{text:string;web_app:{url:string}}`.
- Produces: `opportunityCard`, `campaignCard`, and `tokenDetailCard` returning message text plus keyboard.

- [ ] **Step 1: Write card constraint tests**

Test callback byte length, explicit SOL/token amount on confirms, stale action version embedded in IDs, Telegram message/caption limits, long ticker truncation, all campaign actions, and web-app serialization.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/telegram-cards.test.mts tests/telegram-api.test.mts`

Expected: FAIL because web-app buttons and typed cards are absent.

- [ ] **Step 3: Implement view-model-only card builders**

Card builders receive already-authorized view data and create no trades. Encode callbacks as compact signed action references stored server-side, not JSON payloads. Support `I'm in`, `Half size`, `Pass`, `Why this?`, `Take 25%`, `Exit runner`, `Tighten trail`, `Explain hold`, and `Pause agent` where state permits.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/telegram-cards.test.mts tests/telegram-api.test.mts tests/telegram-router.test.mts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/telegram packages/bot/tests/telegram-cards.test.mts
git commit -m "feat: add rich Telegram trading cards"
```

### Task 2: Render deterministic scenario charts

**Files:**
- Create: `packages/bot/src/visuals/scenario.tsx`
- Create: `packages/bot/src/visuals/render.ts`
- Create: `packages/bot/src/visuals/logo.ts`
- Test: `packages/bot/tests/visual-scenario.test.mts`

**Interfaces:**
- Produces: `renderScenarioPng(model:ScenarioChartModel):Promise<Buffer>` returning a 1200×675 PNG under 5 MiB.

- [ ] **Step 1: Write deterministic-render tests**

Assert PNG signature/dimensions, stable hash for a fixed fixture, observed/primary/alternate legend text, probability sum, uncalibrated label, ticker/logo fallback, negative/flat series handling, and logo fetch limits of 1 MiB/2 seconds with SVG rejected.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/visual-scenario.test.mts`

Expected: FAIL because the renderer is absent.

- [ ] **Step 3: Implement Satori/Resvg rendering**

Normalize points into a fixed plotting rectangle; use solid green for observed, blue dash for primary, amber dash for alternate, red line for invalidation, and deterministic font assets committed under `packages/bot/assets/fonts/`. Never interpolate missing observed data as real ticks.

- [ ] **Step 4: Run tests and inspect one artifact**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/visual-scenario.test.mts`

Run: `pnpm --filter @veyro/bot exec tsx scripts/render-visual-fixtures.ts`

Expected: PASS and generated fixture visually matches the intent in `docs/telegram/examples/telegram-scenario-charts.png` without copying its placeholder values.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/visuals packages/bot/assets packages/bot/tests/visual-scenario.test.mts packages/bot/scripts/render-visual-fixtures.ts
git commit -m "feat: render token scenario charts"
```

### Task 3: Build the Hot Board and token detail Mini App

**Files:**
- Create: `apps/control-plane/app/telegram/hot/page.tsx`
- Create: `apps/control-plane/app/telegram/token/[mint]/page.tsx`
- Create: `apps/control-plane/app/api/telegram/miniapp/route.ts`
- Create: `packages/bot/src/telegram/miniapp-auth.ts`
- Test: `packages/bot/tests/telegram-miniapp-auth.test.mts`

**Interfaces:**
- Produces: verified `MiniAppIdentity {telegramUserId,chatInstance,authDate}` and read-only board/detail JSON.

- [ ] **Step 1: Write Telegram init-data verification tests**

Use Telegram's HMAC construction with fixed fixtures; test valid data, tampered user, expired auth over 5 minutes, duplicate keys, missing hash, and constant-time hash comparison.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/telegram-miniapp-auth.test.mts`

Expected: FAIL because verifier is absent.

- [ ] **Step 3: Implement authenticated read-only views**

Render a responsive 4×4 maximum grid with logo, ticker, `SLEEPER`/`HEATING`/`HOT`/`BREAKOUT` label, risk badge, and profile match. Token detail shows scenarios, liquidity, flow, holders, creator risk, range, and explicit `Nah`/`Review trade` actions; the monetary confirmation remains a Telegram callback.

- [ ] **Step 4: Run app checks**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/telegram-miniapp-auth.test.mts && pnpm --filter @veyro/control-plane build`

Expected: PASS; unauthenticated API calls return 401.

- [ ] **Step 5: Commit**

```bash
git add apps/control-plane/app/telegram apps/control-plane/app/api/telegram/miniapp packages/bot/src/telegram/miniapp-auth.ts packages/bot/tests/telegram-miniapp-auth.test.mts
git commit -m "feat: add Telegram Hot Board mini app"
```

### Task 4: Add factual celebration eligibility and image fallback

**Files:**
- Create: `packages/bot/src/hype/eligibility.ts`
- Create: `packages/bot/src/hype/image-provider.ts`
- Create: `packages/bot/src/hype/render.tsx`
- Test: `packages/bot/tests/hype-engine.test.mts`

**Interfaces:**
- Produces: `celebrationFor(event,accounting,prefs):Celebration|null` and `renderCelebration(celebration):Promise<Buffer>`.

- [ ] **Step 1: Write eligibility and outage tests**

Test confirmed realized profit, principal recovered, new all-time realized campaign win, duplicate event, unrealized spike, losing close, deposit, wash-like churn, muted chat, daily cap, provider timeout, unsafe provider response, and deterministic fallback.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/hype-engine.test.mts`

Expected: FAIL because hype eligibility/provider are absent.

- [ ] **Step 3: Implement celebration policy and renderer**

Use confirmed ledger values only. Apply per-chat quiet hours, opt-out, a default maximum of three celebration posts per day, and event-ID idempotency. The provider prompt may describe mood, mascot, colors, and meme energy only; render ticker, realized P&L, milestone, and timestamp locally over the returned or fallback background.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/hype-engine.test.mts`

Expected: PASS; provider calls contain no addresses, balances, usernames, or raw events.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/hype packages/bot/tests/hype-engine.test.mts
git commit -m "feat: celebrate confirmed trading wins"
```

### Task 5: Connect visuals to Telegram without blocking trading

**Files:**
- Modify: `packages/bot/src/telegram/worker.ts`
- Modify: `packages/bot/src/campaign/worker.ts`
- Create: `packages/bot/src/visuals/jobs.ts`
- Test: `packages/bot/tests/visual-jobs.test.mts`

**Interfaces:**
- Produces: durable non-monetary visual jobs keyed by source event ID.

- [ ] **Step 1: Write asynchronous delivery tests**

Test card-first delivery, chart later, duplicate job, rendering failure fallback to text, Telegram photo retry, stale scenario suppression, and celebration idempotency.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @veyro/bot exec node --import tsx --test tests/visual-jobs.test.mts`

Expected: FAIL because visual jobs are absent.

- [ ] **Step 3: Implement isolated visual jobs**

Append visual jobs after the financial event commits. Do not hold campaign locks while rendering or calling Telegram. On permanent image failure, send the factual text card once and mark the job complete with its error category.

- [ ] **Step 4: Run the visual gate**

Run: `pnpm typecheck && pnpm test && pnpm build`

Expected: PASS; deliberately disabling the image provider does not affect campaign execution tests.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/telegram/worker.ts packages/bot/src/campaign/worker.ts packages/bot/src/visuals/jobs.ts packages/bot/tests/visual-jobs.test.mts
git commit -m "feat: deliver Telegram visuals asynchronously"
```
