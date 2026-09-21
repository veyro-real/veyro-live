# Veyro Telegram Trading Agent — Product and System Design

**Date:** 2026-09-21

**Status:** Canonical product direction

**Scope:** Telegram experience, market intelligence, constrained agent discretion,
campaign management, proactive notifications, and staged delivery

## 1. Product intent

Veyro is a proactive Telegram trading agent for Solana memecoins. It continuously
observes the market, filters opportunities through the preferences and limits of a
Telegram trading profile, explains what it sees, and manages each token as a
stateful trading campaign.

The product is not a command wrapper around a swap API. It should feel like an
opinionated participant in the chat:

- It notices opportunities without being asked.
- It reaches the exact Telegram chat or topic that owns the strategy.
- It understands voice notes and natural-language plans.
- It can alert, request confirmation, or trade autonomously according to the
  profile's selected execution mode.
- It uses bounded model discretion to interpret market structure and avoid rigid
  false positives, while a deterministic plan guard enforces the user's confirmed
  constraints.
- It manages the complete lifecycle of a token: entry, protection, principal
  recovery, runner management, selective moonbag retention, possible re-entry,
  and final cleanup.
- It makes the experience unusually visual, energetic, and fun without inventing
  market data or weakening risk limits.

Veyro may be irreverent, profane, and celebratory. Its factual claims, accounting,
and execution controls must remain sober and auditable.

## 2. Product principles

### 2.1 Agentic within constraints

The language model may decide to enter, hold, add, take profit, adjust a soft
trail, or exit. It does not have unrestricted signing authority and cannot bypass
the confirmed plan.

The governing rule is:

> The agent may exercise discretion and trigger execution, but every proposed
> action must pass the deterministic plan guard and the authoritative spend gate.

This is intentionally different from making the model merely conversational. The
agent's bounded discretion is expected to improve decisions that cannot be
captured well by one fixed percentage, such as distinguishing a healthy range
retest from a failed breakout.

### 2.2 Truthful uncertainty

Veyro does not “know” that a token will break out, continue, dump, or reach a
target. It classifies the observed setup, presents calibrated scenario
probabilities, records its evidence, and acts under a confirmed policy.

Terms such as “hot,” “sleeper,” and “erupting” are product-language labels for
measured states. They are not promises of returns. Charts must distinguish:

- Observed price history.
- The current-time boundary.
- The most likely projected path and uncertainty band.
- The second-most-likely projected path and uncertainty band.
- The remaining probability assigned to other outcomes.

Projected paths are model scenarios, never fabricated historical data.

### 2.3 Capital preservation before spectacle

The experience can be Degen; the controls cannot be. Position sizing, daily
limits, hard-loss limits, liquidity requirements, slippage limits, entitlement
limits, and transaction reconciliation remain in force regardless of model
confidence or chat tone.

### 2.4 Durable, explainable state

Every decision must be reconstructable from persisted inputs:

- Market snapshot and data freshness.
- Compiled user-plan version.
- Campaign state and accounting.
- Model decision, confidence, evidence, and invalidation.
- Plan-guard result.
- Requested and completed effects.
- Transaction signature and reconciliation result.

If the process restarts, the campaign resumes from durable state. If a transaction
outcome is unknown, the campaign freezes further execution until reconciliation.

### 2.5 Delight without loss-chasing

Veyro should be highly engaging and celebrate meaningful wins. It must not weaken
limits, manufacture urgency, or encourage revenge trading after a loss. Hype is a
presentation layer over verified events, not authority to take additional risk.

## 3. Trading profiles and Telegram scope

The long-term product maps a `TradingProfile` to a Telegram conversation scope:

- Private chat: `chat_id`.
- Group chat: `chat_id`, controlled by designated administrators.
- Forum topic: `chat_id + message_thread_id`.

Each profile owns its own:

- Custodied wallet.
- Compiled strategy and strategy history.
- Risk and execution policy.
- Notification windows, quiet hours, tone, and profanity preference.
- Subscription entitlement.
- Campaigns, moonbags, accounting, and audit history.

Messages, alerts, and celebrations return to the exact chat or topic that owns the
profile. Ordinary group participants may inspect opportunities; only authorized
operators may change limits, enable autonomous trading, confirm transactions, or
perform owner actions.

The MVP supports private chats only. The schema should retain a conversation-scope
shape so group chats and topics do not require redesigning ownership later.

## 4. Execution modes

Entry behavior is a per-profile preference:

1. **Alert only** — identify and explain opportunities but never enter.
2. **Confirm to deploy** — construct a current proposal and require a Telegram
   confirmation button.
3. **Auto-shitcoin** — enter automatically when the plan, plan guard, spend gate,
   and campaign-slot claim all approve.
4. **Paused** — observe silently and take no new entries.

Protective position management is configured independently. A profile may require
confirmation for every entry while permitting automatic principal recovery,
protective exits, and trailing exits.

Autonomous entry is always explicit opt-in. Pausing new entries and revoking spend
authority must take effect immediately.

## 5. Entitlements and active slots

Subscription tiers limit simultaneous actively managed token campaigns:

- **Free:** 1 active campaign.
- **Paid:** 3 active campaigns.
- **Pro:** 15 active campaigns.

The slot transition is atomic. Two simultaneous signals cannot exceed the tier.
Campaigns in `ARMED`, `ENTERING`, `OPEN`, active exit, or unresolved execution
consume a slot.

A dormant moonbag does not consume an active slot once:

- Original capital has been recovered.
- Active trading inventory has exited.
- No re-entry setup is currently armed.

A re-entry must claim a slot again. Total moonbags receive a separate cap, and
economically dead dust is closed or abandoned rather than turning the product into
an index fund.

The MVP launches with the Free one-campaign entitlement. Tier fields and atomic
slot claims are implemented now; billing and 3/15 concurrency are later releases.

## 6. Market universe and opportunity pipeline

The intended system observes two overlapping universes:

### 6.1 Discovery universe

New and emerging Solana tokens, including launch activity, migrations, rapid
volume changes, liquidity formation, and early buyer/seller flow.

### 6.2 Continuation universe

Surviving and culturally relevant memes that may range for hours, days, or weeks
before renewed momentum. This universe is required for repeat breakouts, daily and
weekly structure, runner management, and selective moonbags.

The market pipeline is:

```text
provider events and snapshots
  -> normalized observations
  -> feature computation
  -> structural rejection filter
  -> setup classification
  -> profile-specific strategy match
  -> scenario generation and calibration
  -> opportunity or campaign event
```

Required feature families include:

- Executable price and quote depth.
- Liquidity and liquidity change.
- Volume by time window.
- Unique buyers and buyer/seller imbalance.
- Range bounds, duration, and number of tests.
- Volatility and drawdown.
- Breakout attempts, reclaims, and failures.
- Market-cap and holder concentration where reliable.
- Creator and deployer history.
- Mint/freeze authority and token-program facts.
- Social/trend attention as context, not proof of legitimacy.
- Estimated fees, slippage, and exit viability.

No single provider is assumed to cover the complete universe. The MVP uses one
reliable Solana feed and one executable quote source. Provider aggregation comes
after the end-to-end lifecycle is proven.

## 7. Setup and regime interpretation

The first supported playbook is a range-breakout campaign. It must identify:

- A measurable price range.
- Range high, range low, and structural invalidation.
- Compression or constructive consolidation.
- Confirmed or forming breakout.
- Retest, bull flag, or healthy pullback.
- Failed breakout or distribution.
- Active dump, liquidity failure, or dead token.

Market interpretation is orthogonal to campaign lifecycle:

```text
RANGING | BREAKOUT | PULLBACK | DISTRIBUTION | DUMP | DEAD
```

A campaign can remain `OPEN` while its interpretation moves from breakout to
pullback to a new range. This avoids an explosion of lifecycle states.

Fibonacci extensions, measured moves, and comparable-token path analysis may
inform projected levels. They do not become deterministic price promises.

## 8. Campaign state machine

The durable lifecycle is intentionally small:

```text
WATCHING
  -> ARMED
  -> ENTERING
  -> OPEN
  -> RUNNER
  -> MOONBAG
  -> CLOSED
```

Exceptional states are:

```text
PAUSED
EXECUTION_UNKNOWN
ABANDONED
```

The state machine is implemented as a pure transition engine:

```text
transition(currentState, event, compiledPolicy)
  -> nextState
  -> requested effects
```

It never calls Telegram, the model, Jupiter, an RPC endpoint, or the database.
An effect runner performs requested work idempotently and returns the result as a
new immutable event.

Representative events include:

- `MarketSnapshotRecorded`
- `OpportunityQualified`
- `AgentDecisionProposed`
- `PlanGuardApproved` / `PlanGuardRejected`
- `CampaignSlotClaimed`
- `EntrySubmitted` / `EntryFilled` / `EntryFailed`
- `SoftStopCrossed`
- `HardStopCrossed`
- `PrincipalRecoveryRequested` / `PrincipalRecovered`
- `PartialExitFilled`
- `RunnerTrailMoved`
- `ReentryArmed`
- `ExitSubmitted` / `ExitFilled`
- `TransactionOutcomeUnknown` / `TransactionReconciled`
- `MoonbagRetained`
- `CampaignAbandoned`

## 9. Entry and sizing

Once an opportunity qualifies, the agent must construct an entry thesis rather
than merely buy a ticker. The thesis records:

- Setup classification.
- Expected primary and secondary paths.
- Entry zone.
- Structural invalidation.
- Maximum tolerated loss.
- Initial targets and principal-recovery condition.
- Evidence that would cause the thesis to be revised.
- Decision expiry and next-review time.

The default allowed entry is the smallest of:

- Five percent of spendable wallet balance.
- User per-trade limit.
- Remaining daily allowance.
- Profile or system absolute maximum.
- Amount supported by current liquidity and slippage constraints.

`veyro_claim_spend` remains the only authority on per-trade and daily spend
limits. The application must never reimplement or bypass that reservation.

The MVP performs one entry rather than staged pyramiding. Staged entry is added
only after fill, accounting, and exit behavior are validated.

## 10. Position accounting and capital preservation

Each token campaign maintains distinct accounting buckets:

- Initial capital deployed.
- Capital recovered.
- Realized net profit.
- Active trading inventory.
- Remaining moonbag quantity and realizable value.
- Re-entry reserve derived from realized campaign profit.
- Peak realizable value.
- Current soft structural stop.
- Current hard capital-preservation floor.
- Estimated fees and slippage.

The principal invariant is:

> Once initial capital or protected realized profit has been secured, later
> discretionary actions may not put it back at risk.

When realizable value is sufficient, Veyro sells enough tokens to recover the
initial capital plus estimated fees and slippage. The remaining inventory becomes
a runner. The default recovery milestone is 2.0x realizable value: at that point
the campaign attempts to remove the original capital and estimated round-trip
cost while leaving the balance exposed. A confirmed plan may choose another
threshold, but the accounting target remains exact rather than “sell half” by
assumption.

The runner is managed against structure rather than a tight universal percentage:

- During a range or bull flag, the soft trail sits below meaningful structure.
- After a confirmed breakout, it ratchets upward as new support forms.
- An active dump or hard invariant breach exits without waiting for a leisurely
  candle close.

## 11. Soft stops, hard stops, and model discretion

### 11.1 Soft structural stop

The agent may temporarily hold through a soft-stop crossing when evidence
supports a liquidity sweep, ordinary correction, range retest, or bull flag.

Every override must contain:

- Why the existing stop is likely a false positive.
- The evidence supporting a hold.
- A replacement invalidation.
- A maximum grace period.
- A scheduled re-evaluation.
- The additional downside accepted.

Overrides expire. They cannot be chained indefinitely or move the hard floor
lower.

### 11.2 Hard capital-preservation stop

The agent cannot override:

- The user's explicit maximum loss.
- A hard plan constraint.
- Liquidity removal or inability to exit safely.
- Compromised token authority or other configured fatal condition.
- Extreme executable sell imbalance classified as an active dump.
- Data staleness beyond the permitted safety window.
- Revoked authority or paused trading.

## 12. Model decision contract and plan guard

The model produces typed decisions, never free-form execution instructions:

```ts
type AgentDecision = {
  action:
    | "ENTER"
    | "HOLD"
    | "ADD"
    | "RECOVER_PRINCIPAL"
    | "PARTIAL_EXIT"
    | "EXIT"
    | "MOVE_TRAIL";
  confidence: number;
  rationale: string[];
  evidence: string[];
  invalidation: {
    price?: number;
    liquiditySol?: number;
    sellImbalance?: number;
    expiresAt: string;
  };
  amount?: string;
  nextReviewAt: string;
};
```

The natural-language user strategy is compiled into a versioned machine-readable
policy and shown back to the user for confirmation. At runtime the deterministic
plan guard checks:

- Action permission and execution mode.
- Policy version and expiry.
- Campaign entitlement and slot.
- Position sizing and maximum loss.
- Daily spend headroom.
- Protected-capital invariant.
- Re-entry and add permissions.
- Liquidity, slippage, and route viability.
- Market-data freshness.
- Required evidence and decision expiry.
- Transaction concurrency and idempotency.

Only a passing decision becomes an execution effect. The signer receives the
validated action, never an arbitrary model-authored transaction.

## 13. Re-entry and moonbag policy

The long-term campaign may retain a small moonbag after principal recovery and an
active-inventory exit. A moonbag remains only while survival characteristics
persist: liquidity, recurring volume, cultural attention, acceptable holder and
creator behavior, and constructive higher-timeframe structure.

A new independently qualified breakout may arm a re-entry. Re-entry:

- Claims an active slot again.
- Never averages down merely because price fell.
- Uses only the campaign's permitted realized-profit reserve.
- Cannot reduce secured campaign P&L below zero after estimated costs.
- Has a configured maximum number of attempts.

The MVP retains five percent of the originally acquired token quantity as a
moonbag when its realizable value exceeds the configured economic minimum. It
does not re-enter. Re-entry is introduced after the single-entry lifecycle is
proven.

## 14. Dust and dead-token cleanup

The dust collector classifies residual inventory:

- **Recoverable:** an executable route exists and expected proceeds exceed
  transaction cost and configured minimum value. Sell the remainder.
- **Economically dead:** liquidity has disappeared or proceeds are below cost.
  Mark the inventory abandoned, value it conservatively at zero, stop frequent
  monitoring, and release the active slot.

A dead token does not retain a permanent moonbag merely to satisfy a generic
“always leave some” rule.

## 15. Telegram conversation experience

Telegram is a primary product surface, not an alert transport.

### 15.1 Progressive opportunity thread

The selected interaction pattern is progressive disclosure:

1. A high-energy interruption announces the setup and the amount permitted by
   the plan.
2. `Review trade` expands the evidence, risk, scenarios, and current quote.
3. The final action row offers explicit outcomes such as:
   - `Confirm 0.18 SOL`
   - `Half size`
   - `Edit size`
   - `Watch without entering`
   - `Pass`

The quote has a visible expiry. If it expires, confirmation refreshes and
revalidates rather than silently executing stale terms.

### 15.2 Live campaign control

An open campaign has a continuously edited control message containing:

- Token logo, ticker, and campaign state.
- Entry, recovered capital, realized profit, and runner value.
- Current soft trail and hard floor.
- Current primary and secondary scenarios.
- Last decision and next review time.
- Actions such as `Take 25%`, `Exit runner`, `Tighten trail`, `Explain hold`,
  and `Pause agent`.

Critical fills, failures, principal recovery, hard exits, and celebrations also
produce durable milestone messages so an edited card does not erase history.

### 15.3 Voice notes

The voice flow is:

```text
Telegram OGG voice note
  -> speech-to-text
  -> transcript shown to the user
  -> constrained intent/plan interpretation
  -> direct answer for read-only requests, or confirmation for mutations
  -> normal command and plan-guard path
```

The MVP uses hosted speech-to-text. Local `whisper.cpp` on Railway CPU is a
fallback experiment, not the production assumption. OpenCode/Big Pickle may
interpret transcripts and plans, but structured validation remains mandatory.

### 15.4 Proactive timing

Profiles configure timezone, quiet hours, and preferred contact windows. Veyro
may send:

- Scheduled readiness check-ins.
- Immediate high-quality opportunity alerts.
- Campaign decision alerts.
- Daily and weekly recaps.
- Data-feed, reconciliation, or risk warnings.

The MVP uses configured windows and a default cap of two non-urgent proactive
pings per day. Learned activity timing comes later. Urgent risk events and
explicitly requested campaign updates bypass ordinary promotional quieting.

## 16. Hot Board and token detail experience

The bot posts a generated Hot Board snapshot into Telegram and provides an
`Open Hot Board` button that launches a Telegram Mini App.

The initial Mini App uses a readable 4x4 heat rack rather than a bubble map. Each
cell contains:

- Token logo and ticker.
- Degen state label and emoji, such as `🌋 erupting`, `🔥 hot`, `⚡ coiling`,
  `😴 sleeper`, `🧊 cooling`, or `☠️ do not touch`.
- Calibrated breakout probability.

Selecting a token opens the detail surface with:

- Observed-price chart and two scenario projections.
- Probabilities and unmodeled remainder.
- Liquidity, flow, range age, concentration, and risk facts.
- Qualification and rejection reasons.
- `Nah`, `Watch`, and `Fuck yeah — review entry` actions.

The final action still uses the profile's execution mode. `Review entry` does not
silently bypass confirmation mode.

A bubble map is a later complementary view for holder overlap, creator networks,
or token-cluster relationships where spatial encoding adds real information.

## 17. Scenario charts

Charts are deterministically rendered from persisted numeric data. Image models
never draw prices, probabilities, performance figures, or transaction results.

Every scenario chart includes:

- Token logo and ticker.
- Solid observed path.
- Visible `NOW` boundary.
- Primary projected path, uncertainty band, and probability.
- Secondary projected path, uncertainty band, and probability.
- Other-outcomes probability.
- Relevant range, invalidation, trail, and hard-floor annotations.
- Model cohort and timestamp where space permits.

Probabilities are released only after calibration measurement. Until then the UI
uses qualitative confidence or explicitly labels the values experimental.

The approved visual reference is:

- [`docs/telegram/examples/telegram-card-patterns-comparison.png`](../../telegram/examples/telegram-card-patterns-comparison.png)

## 18. Hype Engine

The Hype Engine is a required subsystem. It turns verified campaign events into
high-energy Telegram posts with generated meme artwork, deterministic overlays,
and relevant actions.

### 18.1 Events worth celebrating

- Large unrealized move, clearly labeled `STILL OPEN`.
- Initial capital recovered, labeled `PRINCIPAL SECURED`.
- Realized net profit, labeled `BANKED`.
- Runner reaching a configured multiple, labeled `MOON MISSION`.
- Successful structural exit.
- Avoided rug or dump, labeled `DODGED`.
- Following the confirmed plan under pressure.
- Daily or weekly net-profit and capital-preservation milestone.

Every new configured milestone deserves recognition. Price noise and duplicate
threshold crossings are deduplicated.

### 18.2 Hype content pipeline

```text
verified campaign event and accounting
  -> narrative selection and caption generation
  -> sanitized artwork prompt
  -> hosted image generation
  -> deterministic token logo, ticker, chart, and number overlay
  -> Telegram image, caption, and actions
```

The image provider receives no wallet address, balance, username, private plan,
or unredacted chat history. Generated art contains no authoritative text or
numbers. If generation fails or the free quota is exhausted, Veyro falls back to
branded reusable templates.

The desired win aesthetic is aggressively celebratory: giga-green candlestick
bars, explosive upward motion, meme characters, confetti, and “let's fucking
go” energy. Loss recaps may use gallows humor without encouraging larger sizing
or immediate revenge trades.

Profiles control tone (`Chill`, `Degen`, or `Cracked`), profanity, cadence, and
quiet hours. The intended Veyro personality is `Cracked`; environments that need
clean language can reduce it.

### 18.3 Hype actions

Celebration posts may offer:

- `Show position`
- `Take more profit`
- `Let it run`
- `Share the win`

They do not weaken risk rules or automatically create another trade.

The approved generated-art direction is preserved outside the repository during
design exploration; production art is generated at runtime and cached.

## 19. System architecture

The Pareto-optimal architecture is a deterministic event-driven core with
isolated effect runners:

```text
Telegram
  -> webhook service: authenticate, persist job, return 2xx quickly
  -> conversation worker: files, STT, model interpretation, replies

Market providers
  -> market worker: normalize, measure, classify, emit opportunity events

Campaign events
  -> campaign worker: reduce state, request decisions, run plan guard
  -> execution effects: quote, sign, submit, confirm, reconcile
  -> notification effects: edit control card, send milestone, generate hype

Supabase
  -> event journal, materialized campaign state, profiles, policies,
     accounting, jobs, outbox, idempotency, and entitlements
```

The model adapter is replaceable. OpenCode with `opencode/big-pickle` is viable
as an internet-connected Railway service or process for early experimentation.
Production code should call a stable authenticated interface and must not expose
OpenCode shell, filesystem, or arbitrary network tools to Telegram users.

Image inference runs on a hosted GPU provider. Railway hosts orchestration and
workers, not production-size image or language inference on CPU.

## 20. Railway deployment topology

The intended Railway project contains at least:

1. **Web service** — Next.js app, Telegram webhook, health endpoints, Mini App.
2. **Market worker** — long-lived market sockets/polling and feature computation.
3. **Campaign worker** — durable campaign evaluation, model decisions,
   execution, reconciliation, and notification outbox.

The conversation workload may initially share the campaign worker and separate
when volume requires it. OpenCode may run as a protected private service or be
replaced by direct provider calls. All internal services use Railway private
networking where available.

The webhook must acknowledge quickly after authenticating and durably recording
the update. It must not keep Telegram waiting for transcription, model inference,
image generation, or transaction finalization.

## 21. Security and custody invariants

The existing repository rules remain binding:

- The service is custodial and must disclose that plainly before deposits.
- Secret keys remain encrypted under `VEYRO_CREDENTIALS_KEY` and are never
  logged, returned over APIs, sent to models, or written to disk.
- Every spend passes `veyro_claim_spend` before transaction construction.
- The deployed mainnet program's `check_spend` instruction is additive to the
  database claim, not a replacement.
- A reservation is released only when the system can prove no value moved.
- Unknown submitted transactions are reconciled, never blindly rebuilt.
- Telegram updates, confirmation callbacks, campaign effects, and generated
  notifications are idempotent.
- The webhook secret is verified before accepting an update.
- Model and image-provider prompts contain no secrets.
- Autonomous mode has a global hard off-switch.

Before real funds, rotate every secret known to have passed through development
chat and make the custodial repository private. Rotate `VEYRO_CREDENTIALS_KEY`
only while balances are zero or after a deliberate re-encryption migration.

## 22. Failure behavior

- **Market data stale:** do not enter; freeze discretionary decisions that depend
  on the missing data; keep hard protection active where executable quotes exist.
- **Model unavailable:** use the configured deterministic fallback for mandatory
  hard exits; do not invent a discretionary decision.
- **Speech unavailable:** respond in text and allow typed input.
- **Image generation unavailable:** use a branded static template.
- **Quote unavailable:** treat the position as unpriceable, not worthless; do not
  sell on a zero-value assumption.
- **Transaction unknown:** enter `EXECUTION_UNKNOWN`, hold conflicting actions,
  and reconcile.
- **Telegram delivery failure:** retain the outbox event and retry without
  repeating the underlying trade.
- **Worker restart:** resume from durable events and leases.
- **Provider disagreement:** record sources and lower confidence or withhold the
  action according to policy.

## 23. Learning and validation

Risk tolerances must be derived from historical path data rather than selected
anecdotally. Required dataset fields include second/minute price, executable
liquidity, volume, buyer/seller flow, drawdowns, range width, breakout attempts,
recovery time, creator facts, and eventual outcome.

Policies are versioned and evaluated by comparable setup cohort. Important
questions include:

- How deeply successful tokens retrace before continuation.
- Which signatures precede failed breakouts and dumps.
- Structural versus fixed-percentage trailing performance.
- The effect of principal recovery on downside and retained upside.
- Whether apparent profits were executable after costs.
- The calibration error of scenario probabilities.

New policies run in replay, then live shadow mode, before real authority. Shadow
mode records both:

- The mechanical state-machine action.
- The agent's discretionary action and evidence.

Their subsequent outcomes are compared. Policy changes require operator approval
before promotion in the MVP; automatic policy promotion is a later capability.

## 24. MVP boundary

The first public version proves one complete token lifecycle:

> Veyro watches Solana for one qualified range-breakout opportunity at a time,
> alerts a private Telegram user, optionally enters within strict limits,
> recovers principal when possible, manages the runner, and explains every
> decision.

Included:

- Private Telegram chats.
- One wallet and compiled strategy per profile.
- One active campaign.
- Solana only.
- One reliable market feed plus executable Jupiter quotes.
- One range-breakout playbook.
- Alert, confirm, and explicit autonomous entry modes.
- Five-percent portfolio-relative sizing bounded by existing limits.
- Durable event journal and campaign state machine.
- Bounded model discretion and deterministic plan guard.
- Soft structural stop and non-overridable hard floor.
- Principal recovery, runner management, and a fixed small viable moonbag.
- Telegram progressive cards and live campaign control.
- Hosted speech-to-text and constrained natural-language interpretation.
- Hot Board snapshot plus 4x4 Telegram Mini App.
- Scenario charts after probability calibration; qualitative confidence before.
- Hype Engine with generated art and deterministic overlays.
- Shadow mode and deliberately small real-money system cap.

Deferred:

- Group chats and forum topics.
- Subscription billing and 3/15 live concurrency.
- Multi-provider whole-universe aggregation.
- Multiple playbooks and generalized pattern discovery.
- Automatic re-entry and pyramiding.
- Automatic policy promotion.
- Learned user-activity timing.
- Network bubble maps.
- X OAuth and X-derived execution authority.

## 25. Delivery roadmap

### Phase 0 — Deployment and secret hygiene

- Deploy the merged Telegram code from `main`.
- Apply Telegram/Supabase migrations.
- Rotate exposed development secrets in the required order.
- Configure the Railway origin and Telegram webhook.
- Deploy the existing market worker separately.
- Verify webhook authentication, update dedupe, custody disclosure, and the
  trading off-switch.

### Phase 1 — Durable Telegram and voice foundation

- Replace synchronous webhook processing with durable jobs and immediate 2xx.
- Add conversation-scope records and notification preferences.
- Integrate hosted speech-to-text.
- Add the constrained model adapter and typed intent/plan output.
- Preserve confirmation and idempotency guarantees.

### Phase 2 — Campaign kernel

- Add immutable campaign events and materialized state.
- Implement the pure reducer and idempotent effect runner.
- Add atomic entitlement-slot claims.
- Persist campaign accounting, soft trail, hard floor, and peak realizable value.
- Integrate current buy, sell, and reconciliation functions as effects.

### Phase 3 — Market and scenario engine

- Wire a dependable trade/order-flow source.
- Add range, breakout, pullback, distribution, dump, and dead-token features.
- Create comparable setup cohorts and backtest infrastructure.
- Produce primary/secondary scenarios and calibration reports.
- Run live shadow decisions without transactions.

### Phase 4 — Managed single-token live pilot

- Enable confirm-to-deploy with a small global maximum.
- Enable automatic protective exits and principal recovery.
- Validate unknown-transaction recovery and accounting invariants.
- Add fixed viable moonbag and dead-token dust cleanup.
- Compare mechanical and discretionary decisions.

### Phase 5 — Telegram visual product

- Implement the progressive opportunity thread and live control message.
- Render deterministic scenario-chart images with token metadata.
- Build the 4x4 Hot Board Mini App and snapshot renderer.
- Add activity windows, daily caps, recaps, and exact-topic routing.
- Add Hype Engine generation, caching, overlays, fallbacks, and celebration
  dedupe.

### Phase 6 — Constrained autonomous entry

- Enable `Auto-shitcoin` only for explicitly opted-in profiles.
- Enforce all plan-guard, slot, limit, liquidity, and slippage checks.
- Add operator policy-version promotion and rollback.
- Keep a global kill switch and per-profile immediate pause.

### Phase 7 — Expansion

- Add paid entitlements and 3/15 campaign concurrency.
- Add group/topic administration.
- Add profit-only re-entry and staged entry.
- Add continuation playbooks and higher-timeframe strategies.
- Aggregate additional market providers.
- Add learned notification timing and relationship bubble maps.

## 26. MVP completion criteria

The MVP is complete when:

- A Telegram voice note can create or inspect a plan without blocking the
  webhook.
- The user can see and confirm the compiled plan.
- One qualifying opportunity can progress from discovery through a completed or
  abandoned campaign after restarts.
- Every buy passes the spend claim and every effect is idempotent.
- The agent can hold through a soft stop only with a bounded recorded override.
- The hard floor cannot be overridden.
- Principal recovery uses realizable quotes and includes estimated costs.
- Unknown transaction outcomes freeze and reconcile safely.
- One-campaign entitlement is atomic.
- The Hot Board and token detail show only measured or explicitly modeled data.
- Scenario probabilities have a published calibration result or remain labeled
  experimental.
- Celebrations use verified events and numbers.
- Image, model, speech, market, and Telegram-provider failures degrade according
  to Section 22.
- Shadow and limited-live audit trails can reconstruct every decision.
- All automated tests, type checking, and production build pass in CI.

## 27. Current repository alignment

Existing foundations that should be preserved and integrated:

- `lib/telegram/*`: parsing, routing, confirmation, webhook authentication, and
  Telegram API support.
- `lib/voice/*`: transcriber/speaker interfaces and pending spoken actions.
- `lib/trade/execute.ts`: guarded buy, sell, and reconciliation lifecycle.
- `lib/trade/exit.ts`: pure take-profit, stop-loss, trailing, and maximum-hold
  decision logic.
- `lib/strategy/*`: deterministic strategy compilation and matching.
- `lib/market/*`: candidate ingestion, observation, features, filtering, and
  settlement.
- `worker/feed.ts`: long-lived market process boundary.
- `supabase/migrations/0003_telegram_trading.sql`: initial users, limits,
  strategies, candidates, positions, spend claims, and Telegram dedupe.

Known gaps relative to this design:

- Railway voice transcription and synthesis are not implemented.
- The webhook performs slow work synchronously.
- No durable Telegram job/outbox exists.
- No campaign event journal or reducer exists.
- Exit rules are not persisted or invoked by a worker.
- Peak values, partial exits, protected-capital accounting, and moonbags are not
  represented.
- The market worker does not evaluate every profile or trade automatically.
- Order-flow and creator-history data are incomplete.
- Scenario modeling and calibration do not exist.
- Entitlement slots and billing do not exist.
- Hot Board, Mini App, deterministic chart renderer, and Hype Engine do not
  exist.

This document defines the target product. Existing code and older handoff notes
describe implementation state and must not be mistaken for completion of this
design.
