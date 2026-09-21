import test from 'node:test';
import assert from 'node:assert/strict';
import {intentFromSpeech} from '@veyro/bot/telegram/intent';
import {scrub} from '@veyro/bot/health';

test('bot subpath exports resolve',()=>{
 assert.equal(typeof intentFromSpeech,'function');
 assert.equal(typeof scrub,'function');
});
