// The walkthrough.
//
// Seven screens that edit one message in place, so the chat keeps a single
// tour rather than a wall of them. Order is deliberate: custody before
// anything, a ceiling before funding, funding before a command that spends.
//
// Every screen that describes a command also offers to run it, because
// reading "/scan lists what survived" teaches less than seeing four tokens.
// Those actions reply in a new message and leave the tour where it was.
//
// It says what the bot does and never what the market will do. The feed is a
// filter, and no screen here implies otherwise.

import type {Command} from './parse';
import type {InlineKeyboard} from './types';

export const TUTORIAL='t:';
/** Runs the current screen's suggested command. */
export const TUTORIAL_DO='d:';

export type Step={
 title:string;
 body:string;
 /** Something the reader can do from here, run as if they had typed it. */
 action?:{label:string;command:Command};
};

export const STEPS:Step[]=[
 {
  title:'Quick tour',
  body:
   'Seven screens, about a minute.\n\n'+
   'Veyro buys and sells Solana memecoins for you, out of a wallet it '+
   'controls.\n\n'+
   'Read that last part twice. The private key to that wallet lives on this '+
   'service, not with you. If the service is compromised, whatever is in the '+
   'wallet is gone. Only put in what you can afford to lose.\n\n'+
   'Still with me?',
 },
 {
  title:'Set a ceiling first',
  body:
   'Nothing can be spent until you do. This is not a warning you can click '+
   'past — every trade reserves against your limits in the database before a '+
   'transaction is even built.\n\n'+
   'Three numbers: per trade, per day, and how long before it all switches '+
   'off.\n\n'+
   '/limits 0.5 2 24\n'+
   'Half a SOL per trade, two a day, dead in 24 hours.\n\n'+
   'The expiry is the good bit. Walk away, it lapses, nothing can spend.',
  action:{
   label:'Set 0.5 · 2 SOL · 24h',
   command:{kind:'limits',set:{maxTradeSol:0.5,dailyCapSol:2,hours:24}},
  },
 },
 {
  title:'Put something in it',
  body:
   '/wallet gives you an address, and a button to buy SOL with a card if you '+
   'do not already hold some. Buy it, send it there, and you are funded.\n\n'+
   'Send SOL on Solana and nothing else. Another coin, or SOL bridged to '+
   'another chain, is lost.\n\n'+
   'Leave about 0.012 SOL of room. Every swap pays network and priority '+
   'fees, and Jupiter opens and closes a wrapped-SOL account on the way '+
   'through. Spend down to the last lamport and the next trade just fails.',
  action:{label:'Show my address',command:{kind:'wallet'}},
 },
 {
  title:'What I actually watch',
  body:
   'A worker reads pump.fun launches the second they happen and measures '+
   'each one: how old it is, how many holders, how much the top ten hold, '+
   'liquidity, unique buyers, and whether mint and freeze authority were '+
   'revoked.\n\n'+
   'Most get thrown out, and I will tell you which test they failed — '+
   'INSIDER_CONCENTRATION, BUNDLED_LAUNCH, CREATOR_SERIAL_LAUNCHER.\n\n'+
   'Surviving that is not me saying a token will go up. It means none of '+
   'those specific tests failed. Nothing more.',
  action:{label:'Run a scan',command:{kind:'scan',limit:10}},
 },
 {
  title:'Do not take my word for it',
  body:
   'Tap any token in a scan, or send /why and a mint.\n\n'+
   'You get the measurement itself: the numbers I read, the tests that '+
   'failed, and when I looked.\n\n'+
   'If I never saw the token I say so rather than invent a view. If I could '+
   'not measure something it reads as unknown, never as zero — those mean '+
   'opposite things and you should be able to tell them apart.',
 },
 {
  title:'Buying, and getting back out',
  body:
   '/buy <mint> 0.1\n'+
   'I show you the trade and wait. Nothing moves until you tap confirm, and '+
   'a confirmation only works once.\n\n'+
   '/positions — what you are holding\n'+
   '/sell <id> — close one of them\n\n'+
   'If an entry fails, I tell you it failed. It never quietly disappears.',
  action:{label:'My positions',command:{kind:'positions',includeClosed:false}},
 },
 {
  title:'Two things that make this fast',
  body:
   'Talk to me. Send a voice note and I transcribe it, show you what I '+
   'heard, and wait for a tap before anything spends — so a mishearing costs '+
   'you nothing.\n\n'+
   'Write your own filter:\n'+
   '/edge only tokens under five minutes old with fifty or more holders\n\n'+
   'Plain English, compiled into something that runs the same way every '+
   'time.\n\n'+
   'That is the whole thing. Set your limits and go.',
  action:{label:'Show my edge',command:{kind:'edge',text:null}},
 },
];

const clamp=(i:number):number=>Math.min(STEPS.length-1,Math.max(0,Math.trunc(i)||0));

export function stepMessage(index:number):{text:string;keyboard:InlineKeyboard}{
 const i=clamp(index);
 const step=STEPS[i]!;
 const text=`Step ${i+1} of ${STEPS.length} — ${step.title}\n\n${step.body}`;

 const keyboard:InlineKeyboard=[];
 if(step.action)keyboard.push([{text:step.action.label,callback_data:TUTORIAL_DO+String(i)}]);

 const nav:InlineKeyboard[number]=[];
 if(i>0)nav.push({text:'‹ Back',callback_data:TUTORIAL+String(i-1)});
 // The first screen is a consent gate, so its forward button says so.
 nav.push(...(i<STEPS.length-1
  ?[{text:i===0?'I am in ›':'Next ›',callback_data:TUTORIAL+String(i+1)}]
  :[{text:'Start over',callback_data:TUTORIAL+'0'}]));
 keyboard.push(nav);

 return {text,keyboard};
}

/** The command a screen's action button stands for, if it has one. */
export const stepAction=(index:number):Command|null=>STEPS[clamp(index)]?.action?.command??null;
