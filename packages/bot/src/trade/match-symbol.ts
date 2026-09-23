// Matching a spoken token name to one a user actually holds.
//
// A spoken sell is safe in a way a spoken buy of an unknown mint is not: the
// only tokens it can resolve to are the ones the user already owns, a short
// known list. So "sell inu" against a wallet holding SATOSHINU is one
// candidate, not a guess at the whole chain.
//
// The rule is confidence, not nearness. One clear match resolves; zero or
// several is ambiguous and the caller asks rather than picks. Closing the
// wrong position is the failure this must never produce, so a tie loses.

/** Lowercase, letters and digits only. "Satoshi Inu" and "satoshinu" both
 *  collapse to the same key, so whisper's spacing does not matter. */
const key=(s:string):string=>s.toLowerCase().replace(/[^a-z0-9]/g,'');

export type Holding={id:string;symbol:string;mint:string};

export type Match=
 |{kind:'one';holding:Holding}
 |{kind:'none'}
 |{kind:'many';holdings:Holding[]};

/**
 * The held token a spoken name refers to, if exactly one is clear.
 *
 * Tried in order, and the first tier that yields exactly one match wins:
 *   1. the spoken key equals a symbol key
 *   2. a symbol key contains the spoken key, or the spoken contains a symbol
 *      ("inu" in "satoshinu"; "satoshi inu" containing "satoshinu")
 * A tier that matches several is ambiguous and stops the search — falling
 * through to a looser tier would only widen an already unclear set.
 */
export function matchSymbol(spoken:string,holdings:Holding[]):Match{
 const want=key(spoken);
 if(!want||holdings.length===0)return {kind:'none'};

 const exact=holdings.filter(h=>key(h.symbol)===want);
 if(exact.length===1)return {kind:'one',holding:exact[0]};
 if(exact.length>1)return {kind:'many',holdings:exact};

 const partial=holdings.filter(h=>{
  const s=key(h.symbol);
  return s.includes(want)||want.includes(s);
 });
 if(partial.length===1)return {kind:'one',holding:partial[0]};
 if(partial.length>1)return {kind:'many',holdings:partial};

 return {kind:'none'};
}
