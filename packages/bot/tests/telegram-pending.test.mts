import test from 'node:test';import assert from 'node:assert/strict';
process.env.VEYRO_STORE='memory';
const {pendingStore}=await import('../src/telegram/pending');

const BUY={userId:'u-1',chatId:'99',mint:'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',sol:0.25};

test('a stored confirmation comes back once',async()=>{
 const s=pendingStore();
 await s.put('aaa1',BUY);
 assert.deepEqual(await s.take('aaa1'),BUY);
});

test('the same confirmation cannot be taken twice',async()=>{
 const s=pendingStore();
 await s.put('bbb1',BUY);
 assert.deepEqual(await s.take('bbb1'),BUY);
 assert.equal(await s.take('bbb1'),null,'a second tap must not buy again');
});

test('an unknown confirmation is null, not an error',async()=>{
 assert.equal(await pendingStore().take('nosuchid'),null);
});

test('a confirmation past its lifetime is refused',async()=>{
 let now=1_000_000;
 const s=pendingStore({now:()=>now,ttlMs:60_000});
 await s.put('ccc1',BUY);
 now+=59_000;
 assert.deepEqual(await s.take('ccc1'),BUY);
 await s.put('ddd1',BUY);
 now+=61_000;
 assert.equal(await s.take('ddd1'),null);
});
