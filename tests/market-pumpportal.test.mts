import test from 'node:test';import assert from 'node:assert/strict';
const {parseFeedMessage}=await import('../lib/market/pumpportal');

const create={
 signature:'sig1',mint:'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
 traderPublicKey:'Creator111',txType:'create',initialBuy:1000000,solAmount:2.5,
 bondingCurveKey:'BC1',vTokensInBondingCurve:1e9,vSolInBondingCurve:32.5,
 marketCapSol:41.2,name:'dogwifhat',symbol:'WIF',uri:'https://ipfs.io/x',pool:'pump',
};

test('a create message becomes a candidate',()=>{
 const c=parseFeedMessage(create);
 assert.equal(c?.kind,'candidate');
 assert.equal(c?.candidate.mint,create.mint);
 assert.equal(c?.candidate.symbol,'WIF');
 assert.equal(c?.candidate.name,'dogwifhat');
 assert.equal(c?.candidate.creator,'Creator111');
 assert.equal(c?.candidate.launchpad,'pump.fun');
 assert.equal(c?.candidate.marketCapSol,41.2);
 assert.equal(c?.candidate.initialBuySol,2.5);
 assert.equal(c?.candidate.uri,'https://ipfs.io/x');
 assert.ok(Date.parse(c!.candidate.firstSeen)>0);
});

test('liquidity is carried from the bonding curve',()=>{
 const c=parseFeedMessage(create);
 assert.equal(c?.kind==='candidate'&&c.liquiditySol,32.5);
});

test('a migration is reported separately, not as a new candidate',()=>{
 const m=parseFeedMessage({...create,txType:'migrate',pool:'pumpswap'});
 assert.equal(m?.kind,'migration');
 assert.equal(m?.kind==='migration'&&m.mint,create.mint);
});

test('the pool decides the launchpad',()=>{
 assert.equal((parseFeedMessage({...create,pool:'raydium'}) as any).candidate.launchpad,'raydium');
 assert.equal((parseFeedMessage({...create,pool:undefined}) as any).candidate.launchpad,'unknown');
});

test('a message with no mint is ignored',()=>{
 assert.equal(parseFeedMessage({...create,mint:undefined}),null);
 assert.equal(parseFeedMessage({txType:'create'}),null);
});

test('subscription acknowledgements and junk are ignored',()=>{
 assert.equal(parseFeedMessage({message:'Successfully subscribed to token creation events.'}),null);
 assert.equal(parseFeedMessage(null),null);
 assert.equal(parseFeedMessage('nonsense'),null);
 assert.equal(parseFeedMessage({txType:'buy',mint:create.mint}),null);
});

test('missing numbers become null rather than zero',()=>{
 const c=parseFeedMessage({...create,marketCapSol:undefined,solAmount:undefined});
 assert.equal(c?.kind==='candidate'&&c.candidate.marketCapSol,null);
 assert.equal(c?.kind==='candidate'&&c.candidate.initialBuySol,null);
});

test('a missing name or symbol falls back to something printable',()=>{
 const c=parseFeedMessage({...create,name:undefined,symbol:undefined});
 assert.ok((c as any).candidate.symbol.length>0);
 assert.ok((c as any).candidate.name.length>0);
});

test('the bonding curve address is carried so concentration can exclude it',()=>{
 const c=parseFeedMessage(create);
 assert.equal(c?.kind==='candidate'&&c.bondingCurveKey,'BC1');
});

test('a launch with no bonding curve key carries null, not a guess',()=>{
 const c=parseFeedMessage({...create,bondingCurveKey:undefined});
 assert.equal(c?.kind==='candidate'&&c.bondingCurveKey,null);
});
