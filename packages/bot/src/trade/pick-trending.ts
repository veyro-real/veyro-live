// Choosing what "the dumbest meme coin" means.
//
// It used to mean trending(1): the single most-boosted token on DexScreener,
// which is the same token every time and, once bought, refuses every later
// buy with POSITION_ALREADY_OPEN.
//
// A boost is paid placement, so the ranking measures who spent most on
// visibility. Treating the top of that list as "best" would imply a judgement
// nothing here has made. Picking at random from the loud ones is both more
// honest and what the phrase actually asks for.

import type {TrendingRow} from '../app';

/** How many of the loudest to choose between. */
export const TRENDING_POOL=10;

/**
 * One of the loud tokens the user does not already hold, or null when there
 * is nothing left to pick.
 *
 * `random` is injected so the choice is testable; it must return [0,1).
 */
export function pickTrending(
 rows:TrendingRow[],
 heldMints:string[],
 random:()=>number=Math.random,
):TrendingRow|null{
 const held=new Set(heldMints);
 const open=rows.filter(r=>!held.has(r.mint));
 if(open.length===0)return null;
 // Clamped: a random source that returns exactly 1 would index past the end.
 const index=Math.min(open.length-1,Math.floor(random()*open.length));
 return open[index]!;
}
