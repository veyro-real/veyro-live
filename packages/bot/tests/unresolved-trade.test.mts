import test from 'node:test';import assert from 'node:assert/strict';
import {report} from '../src/telegram/handlers';
import {CONFIRM_BUDGET_MS} from '../src/trade/execute';

const unresolved={
 position:{id:'p-1',symbol:'KITTY',status:'UNKNOWN',paper:false} as never,
 result:{ok:false as const,reason:'CONFIRM_TIMEOUT',signature:'5xSigAbc'},
};

/**
 * The transaction was sent. It may well land. Calling that a failure invites
 * someone to buy the same thing twice.
 */
test('an unconfirmed trade is never reported as not having gone through',()=>{
 const text=report(unresolved as never,'Bought');
 assert.doesNotMatch(text,/did not go through/i);
 assert.doesNotMatch(text,/CONFIRM_TIMEOUT/);
});

test('it says it was sent, and not to send it again',()=>{
 const text=report(unresolved as never,'Bought');
 assert.match(text,/sent/i);
 assert.match(text,/again|retry|twice/i);
});

test('it hands over the signature so the trade can be looked up',()=>{
 assert.match(report(unresolved as never,'Bought'),/5xSigAbc/);
});

test('a real denial still reads as a denial',()=>{
 const denied={position:{id:'',symbol:'X',paper:false} as never,
  result:{ok:false as const,reason:'NO_LIMITS_SET',signature:null}};
 const text=report(denied as never,'Bought');
 assert.match(text,/limits/i);
 assert.doesNotMatch(text,/sent/i);
});

// The webhook awaits the whole route, so this wait is the request's wait.
// Telegram gives up well before a minute.
test('the confirm budget fits inside a webhook request',()=>{
 assert.ok(CONFIRM_BUDGET_MS<=25_000,`${CONFIRM_BUDGET_MS}ms blocks the webhook`);
 assert.ok(CONFIRM_BUDGET_MS>=10_000,'too short to confirm a normal trade');
});
