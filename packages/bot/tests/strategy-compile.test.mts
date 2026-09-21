import test from 'node:test';import assert from 'node:assert/strict';
const {compileStrategy}=await import('../src/strategy/compile');

test('an empty edge is conservative and never trades on its own',()=>{
 const c=compileStrategy('');
 assert.equal(c.autoExecute,false,'auto execution must never be the default');
 assert.equal(c.maxAgeSeconds,null);
 assert.equal(c.minHolders,null);
 assert.deepEqual(c.nameIncludes,[]);
});

test('age limits are read in seconds and minutes',()=>{
 assert.equal(compileStrategy('only tokens under 30 seconds old').maxAgeSeconds,30);
 assert.equal(compileStrategy('less than 5 minutes old').maxAgeSeconds,300);
 assert.equal(compileStrategy('under 30s old').maxAgeSeconds,30);
});

test('holder and buyer floors are read',()=>{
 assert.equal(compileStrategy('at least 50 holders').minHolders,50);
 assert.equal(compileStrategy('min 20 unique buyers').minUniqueBuyers,20);
});

test('concentration ceiling is read as a percentage',()=>{
 assert.equal(compileStrategy('top 10 holders under 20%').maxTop10Pct,20);
});

test('market cap bounds are read in both directions',()=>{
 const c=compileStrategy('market cap over 10 SOL and under 100 SOL');
 assert.equal(c.minMarketCapSol,10);
 assert.equal(c.maxMarketCapSol,100);
});

test('liquidity floor is read',()=>{
 assert.equal(compileStrategy('at least 8 SOL of liquidity').minLiquiditySol,8);
});

test('authority requirements are read',()=>{
 const c=compileStrategy('mint authority revoked and freeze authority revoked');
 assert.equal(c.requireMintAuthorityRevoked,true);
 assert.equal(c.requireFreezeAuthorityRevoked,true);
 assert.equal(compileStrategy('anything').requireMintAuthorityRevoked,false);
});

test('creator launch ceiling is read',()=>{
 assert.equal(compileStrategy('creator has launched at most 3 tokens').maxCreatorLaunchCount,3);
});

test('a score floor is read',()=>{
 assert.equal(compileStrategy('score above 70').minScore,70);
});

test('position size is stored in lamports',()=>{
 assert.equal(compileStrategy('buy 0.25 SOL each time').positionLamports,'250000000');
});

test('name filters are read in both directions',()=>{
 const c=compileStrategy('name includes dog, exclude rug');
 assert.deepEqual(c.nameIncludes,['dog']);
 assert.deepEqual(c.nameExcludes,['rug']);
});

test('auto execution is opt in and only on an explicit phrase',()=>{
 assert.equal(compileStrategy('buy automatically').autoExecute,true);
 assert.equal(compileStrategy('I want to buy fast').autoExecute,false);
});

test('a realistic sentence compiles every clause it mentions',()=>{
 const c=compileStrategy('only tokens under 60 seconds old with at least 40 holders, top 10 under 25%, market cap under 80 SOL, mint authority revoked, buy 0.1 SOL');
 assert.equal(c.maxAgeSeconds,60);
 assert.equal(c.minHolders,40);
 assert.equal(c.maxTop10Pct,25);
 assert.equal(c.maxMarketCapSol,80);
 assert.equal(c.requireMintAuthorityRevoked,true);
 assert.equal(c.positionLamports,'100000000');
 assert.equal(c.autoExecute,false);
});
