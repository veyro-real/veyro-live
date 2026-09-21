import test from 'node:test';import assert from 'node:assert/strict';
const {parseTradeMessage}=await import('../src/market/trades');

const MINT='Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const buy={
 signature:'sig1',mint:MINT,traderPublicKey:'Buyer1',txType:'buy',
 tokenAmount:1_000_000,solAmount:0.35,newTokenBalance:1_000_000,
 bondingCurveKey:'BC1',vTokensInBondingCurve:8e8,vSolInBondingCurve:34.2,
 marketCapSol:43.1,pool:'pump',
};

test('a buy parses with its trader, size and curve state',()=>{
 const t=parseTradeMessage(buy)!;
 assert.equal(t.mint,MINT);
 assert.equal(t.trader,'Buyer1');
 assert.equal(t.side,'buy');
 assert.equal(t.solAmount,0.35);
 assert.equal(t.tokenAmount,1_000_000);
 assert.equal(t.curveSol,34.2);
 assert.equal(t.marketCapSol,43.1);
 assert.ok(t.at>0,'a trade is stamped when seen');
});

test('a sell parses as a sell',()=>{
 assert.equal(parseTradeMessage({...buy,txType:'sell'})!.side,'sell');
});

test('create and migrate messages are not trades',()=>{
 assert.equal(parseTradeMessage({...buy,txType:'create'}),null);
 assert.equal(parseTradeMessage({...buy,txType:'migrate'}),null);
});

test('a trade with no mint, trader or size is ignored',()=>{
 assert.equal(parseTradeMessage({...buy,mint:undefined}),null);
 assert.equal(parseTradeMessage({...buy,traderPublicKey:undefined}),null);
 assert.equal(parseTradeMessage({...buy,solAmount:undefined}),null);
 assert.equal(parseTradeMessage({...buy,solAmount:0}),null);
});

test('acknowledgements and junk are ignored',()=>{
 assert.equal(parseTradeMessage({message:'Successfully subscribed'}),null);
 assert.equal(parseTradeMessage(null),null);
 assert.equal(parseTradeMessage('nope'),null);
});

test('missing curve state is null rather than zero',()=>{
 const t=parseTradeMessage({...buy,vSolInBondingCurve:undefined,marketCapSol:undefined})!;
 assert.equal(t.curveSol,null);
 assert.equal(t.marketCapSol,null);
});
