# Veyro Bot Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the existing Veyro repository as a durable Telegram trading agent on Railway, from voice note and opportunity discovery through guarded execution, campaign management, visual reporting, and staged live launch.

**Architecture:** The bot repository becomes a pnpm workspace with one HTTP control plane, three independently restartable workers, and focused shared packages. PostgreSQL/Supabase is the durable coordination layer; pure reducers decide campaign transitions, bounded model output proposes decisions, and deterministic policy code authorizes every effect.

**Tech Stack:** pnpm 10 workspaces, Node.js 22, TypeScript 5.9, Next.js 16, React 19, Supabase/PostgreSQL, Telegram Bot API, Solana web3.js, Jupiter, Railway, Satori/Resvg.

**Spec:** `docs/superpowers/specs/2026-09-21-telegram-trading-agent-design.md`

## Global Constraints

- Scope is only `/Users/jeremy/Development/Veyro/veyro-live`; do not restructure the parent Veyro workspace.
- Keep `VEYRO_TRADING_ENABLED=false` until the live-launch gates explicitly enable it.
- Never place Telegram tokens, wallet keys, Supabase service credentials, model credentials, or raw voice recordings in prompts, logs, images, commits, or generated artifacts.
- Every monetary effect requires a persisted plan, deterministic policy approval, an idempotency key, and an append-only audit event.
- A model may exercise bounded discretion but cannot bypass hard size, spend, slot, liquidity, slippage, expiry, or user-mode constraints.
- Free, paid, and pro tiers allow at most 1, 3, and 15 concurrently active token campaigns respectively.
- Telegram webhook delivery must be acknowledged quickly and processed durably outside the request.
- Scenario probabilities are experimental and must not be presented as calibrated until shadow outcomes establish calibration.
- Charts and financial facts are deterministic; generated imagery is decorative only.

## Review Focus

- A duplicate or reordered Telegram update must produce at most one durable job and one monetary effect.
- A worker crash after broadcasting a swap but before recording completion must reconcile instead of rebroadcasting.
- A malformed or adversarial model response must be rejected without mutating a campaign.
- Stale market data, missing quotes, or excessive slippage must freeze new entries while preserving exit/reconcile paths.
- Concurrent workers must not exceed tier slots, spend limits, or sell more tokens than remain in a campaign.

---

## Delivery sequence

Execute these plans in order. Each ends with independently testable software and a deployable artifact.

1. [`2026-09-21-bot-pnpm-workspace.md`](./2026-09-21-bot-pnpm-workspace.md) — behavior-preserving workspace migration.
2. [`2026-09-21-durable-telegram-voice.md`](./2026-09-21-durable-telegram-voice.md) — durable webhook jobs, hosted speech-to-text, structured intent, and Telegram worker.
3. [`2026-09-21-campaign-kernel.md`](./2026-09-21-campaign-kernel.md) — campaign state machine, accounting ledger, partial exits, and plan guard.
4. [`2026-09-21-market-agent-intelligence.md`](./2026-09-21-market-agent-intelligence.md) — range/breakout signals, scenarios, bounded model discretion, and shadow calibration.
5. [`2026-09-21-telegram-visual-hype.md`](./2026-09-21-telegram-visual-hype.md) — action cards, Hot Board, scenario charts, and factual celebration images.
6. [`2026-09-21-live-launch-hardening.md`](./2026-09-21-live-launch-hardening.md) — Railway services, operational gates, secret rotation, shadow rehearsal, and limited live launch.

## Program acceptance

- A voice note is accepted once, transcribed, summarized into a proposed action, and confirmed or rejected with Telegram buttons.
- A qualified token can create one campaign, enter under the user's mode, recover principal with a partial exit, trail a runner, retain or remove a moonbag, and free its tier slot.
- Every proposal, authorization, quote, broadcast, fill, retry, user action, and campaign transition is inspectable from the audit log.
- Private-chat MVP works end to end; group/thread identity is represented in the schema without pretending it is production-ready.
- The web service and each worker can be deployed, restarted, health-checked, and rolled back independently on Railway.
- Live trading starts disabled and can only be enabled after all gates in the final plan pass.
