// Sensible limits for someone who has just funded a wallet.
//
// Without limits every buy is denied with NO_LIMITS_SET, which is friction
// with no safety behind it: the confirmation tap is what authorises a spend,
// and limits are the ceiling that bounds the damage if something goes wrong.
// Someone who has deposited should be able to trade.
//
// Computed once, from the balance at the time, and stored as absolute
// lamports. veyro_claim_spend stays the only authority on whether a spend is
// allowed — it cannot see an on-chain balance, so a percentage has to become
// a number before it reaches the database.

/** A single trade: a slice small enough that being wrong is survivable. */
export const DEFAULT_TRADE_FRACTION=0.05;

/** A day: enough for a few trades without emptying the wallet. */
export const DEFAULT_DAY_FRACTION=0.20;

/** Below this a trade is dust — the fees cost more than the position. */
export const MIN_TRADE_LAMPORTS=5_000_000n; // 0.005 SOL

/** Defaults lapse, so walking away switches spending off by itself. */
export const DEFAULT_HOURS=24;

export type DefaultLimits={
 maxTradeLamports:bigint;
 dailyCapLamports:bigint;
 hours:number;
};

const slice=(bag:bigint,fraction:number):bigint=>
 BigInt(Math.round(Number(bag)*fraction));

/**
 * Limits for a wallet holding `spendable` lamports, or null when there is
 * not enough there to place a single trade worth making.
 */
export function defaultLimits(spendable:bigint):DefaultLimits|null{
 if(spendable<MIN_TRADE_LAMPORTS)return null;

 // A percentage of a small bag is dust, so it is raised to the floor — but
 // never above the balance, which would authorise a spend that cannot happen.
 const perTrade=slice(spendable,DEFAULT_TRADE_FRACTION);
 const maxTradeLamports=perTrade<MIN_TRADE_LAMPORTS
  ? (MIN_TRADE_LAMPORTS<spendable?MIN_TRADE_LAMPORTS:spendable)
  : perTrade;

 // veyro_limits enforces daily_cap >= max_trade, so the cap is at least one
 // trade even when the percentages would put it below.
 const perDay=slice(spendable,DEFAULT_DAY_FRACTION);
 const dailyCapLamports=perDay<maxTradeLamports?maxTradeLamports:perDay;

 return {maxTradeLamports,dailyCapLamports,hours:DEFAULT_HOURS};
}
