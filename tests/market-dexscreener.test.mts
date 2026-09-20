import test from 'node:test';import assert from 'node:assert/strict';
const {parseBoost,parsePair}=await import('../lib/market/dexscreener');

const MINT='CDAC33JvozJ1UjxBMkvZgJcVXoxdH9iGxeBXUJdXpump';
const SOL='So11111111111111111111111111111111111111112';
const boost={
 url:'https://dexscreener.com/solana/x',chainId:'solana',tokenAddress:MINT,
 description:'Jean Wojak is another internet-culture meme legend reborn on Solana',
 icon:'x',totalAmount:500,links:[{url:'https://jeanwojak.fun'}],
};
const pair={
 dexId:'pumpswap',pairCreatedAt:Date.now()-120_000,priceUsd:'0.003300',
 fdv:3272197,marketCap:3272197,
 liquidity:{usd:170866.65,base:26082725,quote:764.7044},
 volume:{h24:3681764.38,h1:845226.82,m5:12942.25},
 txns:{m5:{buys:730,sells:315},h1:{buys:9000,sells:4000}},
 baseToken:{address:MINT,name:'Jean Wojak',symbol:'JEANJAK'},
 quoteToken:{address:SOL,symbol:'SOL'},
 info:{imageUrl:'https://cdn.example/x.png',socials:[{type:'twitter',url:'https://x.com/x'}]},
};

test('a solana boost becomes a trending entry',()=>{
 const b=parseBoost(boost)!;
 assert.equal(b.mint,MINT);
 assert.match(b.description,/Jean Wojak/);
 assert.equal(b.boost,500);
});

test('other chains are ignored',()=>{
 assert.equal(parseBoost({...boost,chainId:'base'}),null);
 assert.equal(parseBoost({...boost,tokenAddress:undefined}),null);
 assert.equal(parseBoost(null),null);
});

test('a pair becomes a candidate with its symbol and name',()=>{
 const p=parsePair(pair)!;
 assert.equal(p.candidate.mint,MINT);
 assert.equal(p.candidate.symbol,'JEANJAK');
 assert.equal(p.candidate.name,'Jean Wojak');
 assert.equal(p.candidate.launchpad,'pumpswap');
 assert.equal(p.candidate.uri,'https://cdn.example/x.png');
});

test('liquidity in SOL comes from the quote side, only when the quote IS SOL',()=>{
 assert.equal(parsePair(pair)!.liquiditySol,764.7044);
 const usdcPair={...pair,quoteToken:{address:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',symbol:'USDC'}};
 assert.equal(parsePair(usdcPair)!.liquiditySol,null,
  'a USDC quote is not SOL and must not be reported as if it were');
});

test('market cap is USD and must never be written into a SOL field',()=>{
 const p=parsePair(pair)!;
 assert.equal(p.candidate.marketCapSol,null,'we were given USD, not SOL');
 assert.equal(p.marketCapUsd,3272197,'the USD figure is kept, just named honestly');
});

test('trade counts are carried through',()=>{
 const p=parsePair(pair)!;
 assert.equal(p.buys5m,730);
 assert.equal(p.sells5m,315);
});

test('age comes from when the pair was created',()=>{
 const p=parsePair(pair)!;
 assert.ok(Math.abs(p.ageSeconds-120)<3,'got '+p.ageSeconds);
});

test('a pair with no base token or no mint is not a candidate',()=>{
 assert.equal(parsePair({...pair,baseToken:undefined}),null);
 assert.equal(parsePair({...pair,baseToken:{symbol:'X'}}),null);
 assert.equal(parsePair(null),null);
});

test('missing numbers are null rather than zero',()=>{
 const p=parsePair({...pair,liquidity:undefined,txns:undefined,marketCap:undefined,volume:undefined})!;
 assert.equal(p.liquiditySol,null);
 assert.equal(p.buys5m,null);
 assert.equal(p.marketCapUsd,null);
 assert.equal(p.volumeUsd5m,null);
});

test('an unknown dex is unknown, not guessed',()=>{
 assert.equal(parsePair({...pair,dexId:'somethingelse'})!.candidate.launchpad,'unknown');
 assert.equal(parsePair({...pair,dexId:'raydium'})!.candidate.launchpad,'raydium');
});

test('the creator is not claimed, because DexScreener does not report one',()=>{
 assert.equal(parsePair(pair)!.candidate.creator,'unknown');
});
