// Shared domain contracts for the Telegram trading bot.
// Everything below is owned here; subsystems import, they do not redefine.

/** Lamports are the only unit of SOL value that crosses a subsystem boundary. */
export type Lamports = bigint;

export type UserId = string;

export type User = {
 id: UserId;
 telegramChatId: string;
 telegramUsername: string | null;
 walletPubkey: string | null;
 createdAt: string;
};

// ---------------------------------------------------------------- limits

/**
 * An owner's spending mandate. `policyAddress` is null until the on-chain
 * mainnet policy account exists; enforcement is identical either way, the
 * on-chain gate is additive.
 */
export type Limits = {
 userId: UserId;
 maxTradeLamports: Lamports;
 dailyCapLamports: Lamports;
 expiresAt: number; // unix seconds
 active: boolean;
 policyAddress: string | null;
 agentPubkey: string | null;
};

export type LimitDenial =
 | 'NO_LIMITS_SET'
 | 'LIMITS_REVOKED'
 | 'LIMITS_EXPIRED'
 | 'MAX_TRADE_EXCEEDED'
 | 'DAILY_CAP_EXCEEDED'
 | 'INSUFFICIENT_BALANCE'
 | 'INVALID_AMOUNT';

export type LimitVerdict =
 | { decision: 'ALLOW'; reservationId: string }
 | { decision: 'DENY'; reason: LimitDenial };

// ---------------------------------------------------------------- market

export type Launchpad = 'pump.fun' | 'pumpswap' | 'raydium' | 'unknown';

/** A token observed at launch, before any filtering. */
export type Candidate = {
 mint: string;
 symbol: string;
 name: string;
 launchpad: Launchpad;
 creator: string;
 firstSeen: string; // ISO
 initialBuySol: number | null;
 marketCapSol: number | null;
 uri: string | null;
};

/** Every rejection reason is named so the bot can explain itself. */
export type RejectReason =
 | 'CREATOR_SERIAL_LAUNCHER'
 | 'CREATOR_PRIOR_RUG'
 | 'INSIDER_CONCENTRATION'
 | 'BUNDLED_LAUNCH'
 | 'LP_NOT_LOCKED'
 | 'MINT_AUTHORITY_LIVE'
 | 'FREEZE_AUTHORITY_LIVE'
 | 'LIQUIDITY_TOO_THIN'
 | 'MARKET_CAP_OUT_OF_RANGE'
 | 'TOO_OLD'
 | 'NO_SOCIAL_FOOTPRINT';

export type Assessment = {
 mint: string;
 at: string;
 passed: boolean;
 rejections: RejectReason[];
 /** 0-100. Only meaningful when `passed` is true. */
 score: number;
 features: Features;
};

/** Raw measured inputs. Never derived, never rounded for display. */
export type Features = {
 ageSeconds: number;
 holders: number | null;
 top10Pct: number | null;
 creatorLaunchCount: number | null;
 creatorGraduationCount: number | null;
 liquiditySol: number | null;
 marketCapSol: number | null;
 buyCount: number | null;
 sellCount: number | null;
 uniqueBuyers: number | null;
 mintAuthorityRevoked: boolean | null;
 freezeAuthorityRevoked: boolean | null;
};

// ---------------------------------------------------------------- strategy

/**
 * A user's edge, compiled from plain English into something deterministic.
 * The English is kept verbatim so we can recompile when the schema grows.
 */
export type Strategy = {
 id: string;
 userId: UserId;
 version: number;
 rawText: string;
 compiled: CompiledStrategy;
 active: boolean;
 createdAt: string;
};

export type CompiledStrategy = {
 minScore: number;
 maxAgeSeconds: number | null;
 minHolders: number | null;
 maxTop10Pct: number | null;
 minLiquiditySol: number | null;
 maxMarketCapSol: number | null;
 minMarketCapSol: number | null;
 maxCreatorLaunchCount: number | null;
 minUniqueBuyers: number | null;
 requireMintAuthorityRevoked: boolean;
 requireFreezeAuthorityRevoked: boolean;
 /** Case-insensitive substrings matched against symbol and name. */
 nameIncludes: string[];
 nameExcludes: string[];
 positionLamports: string;
 autoExecute: boolean;
};

export type StrategyMatch = {
 strategyId: string;
 version: number;
 matched: boolean;
 /** Which compiled clauses failed, named for the explain output. */
 failedClauses: string[];
};

// ---------------------------------------------------------------- execution

export type PositionStatus =
 | 'OPENING'
 | 'OPEN'
 | 'CLOSING'
 | 'CLOSED'
 | 'FAILED'
 | 'UNKNOWN';

export type Position = {
 id: string;
 userId: UserId;
 mint: string;
 symbol: string;
 status: PositionStatus;
 entrySignature: string | null;
 entryLamports: string;
 tokensReceived: string | null;
 exitSignature: string | null;
 exitLamports: string | null;
 reason: string;
 openedAt: string;
 closedAt: string | null;
};

export type SwapQuote = {
 inputMint: string;
 outputMint: string;
 inLamports: string;
 outAmount: string;
 minOutAmount: string;
 priceImpactPct: number;
 slippageBps: number;
 routePlan: unknown;
};

export type SwapResult =
 | { ok: true; signature: string; outAmount: string }
 | { ok: false; reason: string; signature: string | null };

/** The result of a buy or sell. Denials arrive here, they are not thrown. */
export type TradeOutcome = {
 position: Position;
 result: SwapResult;
};
