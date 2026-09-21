// The walkthrough.
//
// Seven screens, edited in place so the chat keeps one message rather than
// ten. Order is deliberate: custody before anything, limits before funding,
// funding before a single command that can spend.
//
// It describes what the bot does and never what the market will do. The feed
// is a filter, not a tip, and no screen here says otherwise.

import type {InlineKeyboard} from './types';

export const TUTORIAL='t:';

export type Step={title:string;body:string};

export const STEPS:Step[]=[
 {
  title:'What you are about to use',
  body:
   'Veyro buys and sells Solana memecoins from a wallet this bot controls.\n\n'+
   'Custody, plainly: the private key to that wallet is held by this service, '+
   'not by you. If the service is compromised, the funds in it are gone. '+
   'Deposit what you are willing to lose and not a lamport more.\n\n'+
   'Everything after this screen assumes you are fine with that.',
 },
 {
  title:'Set your ceiling first',
  body:
   'Nothing can be spent until you set limits. Every trade reserves against '+
   'them in the database before a transaction is even built, so this is a '+
   'hard stop rather than a warning.\n\n'+
   '/limits 0.5 2 24\n'+
   '0.5 SOL per trade · 2 SOL a day · expires in 24 hours.\n\n'+
   'The expiry is the point. When it lapses, spending stops until you set it '+
   'again — so walking away is the safe default.',
 },
 {
  title:'Fund it',
  body:
   '/wallet gives your deposit address and balance.\n\n'+
   'Leave about 0.012 SOL of headroom. Each swap pays network and priority '+
   'fees, and Jupiter opens and closes a wrapped-SOL account on the way '+
   'through. Spending to the last lamport just makes the next trade fail.',
 },
 {
  title:'What the feed actually watches',
  body:
   'A worker reads pump.fun launches as they happen and measures each one: '+
   'age, holder count, how much of the supply the top ten hold, liquidity, '+
   'unique buyers, and whether mint and freeze authority were revoked.\n\n'+
   'Most are thrown out, and every rejection has a name — '+
   'INSIDER_CONCENTRATION, BUNDLED_LAUNCH, CREATOR_SERIAL_LAUNCHER.\n\n'+
   '/scan lists what survived. Surviving a filter is not a reason to buy; '+
   'it only means none of those specific tests failed.',
 },
 {
  title:'Make it explain itself',
  body:
   '/why <mint> prints the measurement behind a verdict: the numbers it '+
   'read, the tests that failed, and the time it looked.\n\n'+
   'If it never saw the token, it tells you that instead of inventing a '+
   'view. Any number it did not measure reads as unknown, never as zero.',
 },
 {
  title:'Buying, and getting back out',
  body:
   '/buy <mint> 0.1 shows you the trade and waits for a tap. Nothing moves '+
   'until you confirm, and a confirmation can only be used once.\n\n'+
   '/positions — what you are holding.\n'+
   '/sell <id> — close one of them.\n\n'+
   'A position that fails to open is reported as failed. It is never quietly '+
   'dropped.',
 },
 {
  title:'Hands free, and your own filter',
  body:
   'Send a voice note. It transcribes, shows you what it heard, and waits '+
   'for a tap before anything spends — so a misheard instruction costs you '+
   'nothing.\n\n'+
   '/edge only tokens under five minutes old with fifty or more holders\n'+
   'Plain English, compiled into something deterministic that runs the same '+
   'way every time.\n\n'+
   'That is the whole surface. Set your limits and go.',
 },
];

const clamp=(i:number):number=>Math.min(STEPS.length-1,Math.max(0,Math.trunc(i)||0));

export function stepMessage(index:number):{text:string;keyboard:InlineKeyboard}{
 const i=clamp(index);
 const step=STEPS[i]!;
 const text=
  `Step ${i+1} of ${STEPS.length} — ${step.title}\n\n${step.body}`;

 const nav:InlineKeyboard[number]=[];
 if(i>0)nav.push({text:'‹ Back',callback_data:TUTORIAL+String(i-1)});
 if(i<STEPS.length-1)nav.push({text:'Next ›',callback_data:TUTORIAL+String(i+1)});

 const keyboard:InlineKeyboard=[nav];
 if(i===STEPS.length-1)keyboard.push([{text:'Start over',callback_data:TUTORIAL+'0'}]);
 return {text,keyboard};
}
