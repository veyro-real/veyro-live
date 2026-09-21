process.env.VEYRO_STORE='memory';
import test from 'node:test';
import assert from 'node:assert/strict';
import {actionStore} from '../src/voice/actions';
import {getState,saveState} from '../src/store';

// veyro_state.value is `jsonb not null`. The memory store now refuses null the
// same way, so a clear path that upserts null fails here instead of only in
// production.
test('the memory store refuses a null value, as Postgres does',async()=>{
 await assert.rejects(()=>saveState('probe',null),/STATE_VALUE_REQUIRED/);
});

test('clearing a pending action removes it without writing null',async()=>{
 const store=actionStore();
 await store.put('a1',{userId:'u1',kind:'buy'} as never);
 assert.equal(typeof await getState('tgaction:a1'),'object');

 await store.clear('u1');
 assert.equal(await getState('tgaction:a1'),null);
 assert.equal(await getState('tgaction:user:u1'),null);
});

test('taking a pending action removes it without writing null',async()=>{
 const store=actionStore();
 await store.put('a2',{userId:'u2',kind:'buy'} as never);
 const taken=await store.take('a2');
 assert.equal((taken as {userId:string}).userId,'u2');
 assert.equal(await getState('tgaction:a2'),null);
 assert.equal(await getState('tgaction:user:u2'),null);
});

test('clearing when nothing is pending is a no-op, not an error',async()=>{
 await actionStore().clear('nobody');
});
