// Individual trades from the launch feed.
//
// The order-flow signal is built from these, so the parser is strict: a
// trade with no trader or no size tells us nothing about who is buying and
// would only pollute the wallet statistics.

export type Trade={
 mint:string;
 trader:string;
 side:'buy'|'sell';
 solAmount:number;
 tokenAmount:number|null;
 /** Virtual SOL in the bonding curve after this trade: curve progress. */
 curveSol:number|null;
 marketCapSol:number|null;
 /** When we saw it. The feed carries no timestamp we can trust. */
 at:number;
};

const n=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)?v:null;
const s=(v:unknown):string|null=>typeof v==='string'&&v.length>0?v:null;

export function parseTradeMessage(raw:unknown,now=Date.now()):Trade|null{
 if(!raw||typeof raw!=='object')return null;
 const m=raw as Record<string,unknown>;

 const side=s(m.txType);
 if(side!=='buy'&&side!=='sell')return null;

 const mint=s(m.mint),trader=s(m.traderPublicKey),solAmount=n(m.solAmount);
 if(!mint||!trader||solAmount===null||solAmount<=0)return null;

 return {
  mint,trader,side,solAmount,
  tokenAmount:n(m.tokenAmount),
  curveSol:n(m.vSolInBondingCurve),
  marketCapSol:n(m.marketCapSol),
  at:now,
 };
}
