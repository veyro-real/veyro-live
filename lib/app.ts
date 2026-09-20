// The only surface the Telegram layer calls. Channel adapters (Telegram,
// MCP, web) translate to and from these; none of them reach into lib/trade,
// lib/wallet or lib/market directly.
//
// Every function here is implemented in lib/trade/* and lib/market/*.
// Signatures are frozen: change one and tell the channel owner first.

import type {
 Assessment, Candidate, Limits, Position, Strategy, StrategyMatch, SwapResult, User,
} from './types';

export type ScanRow = {
 candidate: Candidate;
 assessment: Assessment;
 match: StrategyMatch | null;
};

export type TradeOutcome = {
 position: Position;
 result: SwapResult;
};

/** Idempotency key. The Telegram layer passes the update_id so a redelivered
 *  webhook can never open a second position. */
export type RequestKey = string;

// ---------------------------------------------------------------- identity

export async function ensureUser(telegramChatId: string, username: string | null): Promise<User> {
 throw Error('NOT_IMPLEMENTED');
}

/** Creates the custodied wallet on first call. Returns the deposit address. */
export async function ensureWallet(userId: string): Promise<{ pubkey: string; lamports: string }> {
 throw Error('NOT_IMPLEMENTED');
}

export async function linkX(userId: string, accessToken: string, refreshToken: string, handle: string): Promise<void> {
 throw Error('NOT_IMPLEMENTED');
}

// ---------------------------------------------------------------- limits

export async function setLimits(
 userId: string,
 input: { maxTradeSol: number; dailyCapSol: number; hours: number },
): Promise<Limits> {
 throw Error('NOT_IMPLEMENTED');
}

export async function getLimits(userId: string): Promise<Limits | null> {
 throw Error('NOT_IMPLEMENTED');
}

export async function revokeLimits(userId: string): Promise<void> {
 throw Error('NOT_IMPLEMENTED');
}

// ---------------------------------------------------------------- strategy

/** Compiles plain English into a CompiledStrategy and stores it as a new
 *  version. The previous version is deactivated, never deleted. */
export async function setStrategy(userId: string, rawText: string): Promise<Strategy> {
 throw Error('NOT_IMPLEMENTED');
}

export async function getStrategy(userId: string): Promise<Strategy | null> {
 throw Error('NOT_IMPLEMENTED');
}

// ---------------------------------------------------------------- market

/** Recent candidates that passed the rejection filter, newest first, with the
 *  user's strategy applied when they have one. */
export async function scan(userId: string, limit: number): Promise<ScanRow[]> {
 throw Error('NOT_IMPLEMENTED');
}

/** Why a specific mint scored what it scored. Safe to call for any mint. */
export async function explain(mint: string): Promise<ScanRow | null> {
 throw Error('NOT_IMPLEMENTED');
}

// ---------------------------------------------------------------- trading

/** Claims spend against veyro_claim_spend, then swaps SOL for the mint via
 *  Jupiter. Denials come back as result.ok === false with a named reason;
 *  they are not thrown. */
export async function buy(
 userId: string,
 mint: string,
 sol: number,
 key: RequestKey,
): Promise<TradeOutcome> {
 throw Error('NOT_IMPLEMENTED');
}

export async function sell(userId: string, positionId: string, key: RequestKey): Promise<TradeOutcome> {
 throw Error('NOT_IMPLEMENTED');
}

export async function positions(userId: string, includeClosed: boolean): Promise<Position[]> {
 throw Error('NOT_IMPLEMENTED');
}

/** Reconciles OPENING/CLOSING positions against chain state. Safe to call on
 *  every /positions and from the worker. */
export async function reconcilePositions(userId: string): Promise<Position[]> {
 throw Error('NOT_IMPLEMENTED');
}
