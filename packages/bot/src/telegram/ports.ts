// The boundary between the Telegram channel and everything it needs.
//
// These are ports, not implementations: the router depends on them, and so
// do the adapters that satisfy them. Keeping them here stops a concrete
// adapter having to import from the orchestrator, which is backwards and
// was how lib/voice/actions.ts ended up depending on router.ts.

import type * as app from '../app';
import type {InlineKeyboard} from './types';
import type {Intent} from './intent';

export type AppSurface=Pick<typeof app,
 'ensureUser'|'ensureWallet'|'setLimits'|'getLimits'|'ensureDefaultLimits'|'revokeLimits'|
 'setStrategy'|'getStrategy'|'setTradingMode'|'tradingMode'|'scan'|'explain'|'previewBuy'|'buy'|'raiseLimitAndBuy'|'withinHardCap'|'hardCapSol'|'sell'|'positions'|'trending'|
 'reconcilePositions'>;

export type Sent={chatId:string;text:string;keyboard?:InlineKeyboard};

export type Outbox={
 send(chatId:string,text:string,keyboard?:InlineKeyboard):Promise<void>;
 answer(callbackQueryId:string,text?:string):Promise<void>;
 /** Replaces a message in place. Used by the walkthrough so it stays
  *  one message instead of a screen per step. */
 edit(chatId:string,messageId:number,text:string,keyboard?:InlineKeyboard):Promise<void>;
 /** Telegram fetches the url itself; we never download the bytes. */
 photo(chatId:string,imageUrl:string,caption:string,keyboard?:InlineKeyboard):Promise<void>;
 /** OGG/Opus bytes, uploaded as a Telegram voice note. */
 voiceNote(chatId:string,ogg:Buffer):Promise<void>;
};

/** A buy the user has been shown but has not yet confirmed. */
export type PendingBuy={userId:string;chatId:string;mint:string;sol:number};

export type PendingStore={
 put(id:string,value:PendingBuy):Promise<void>;
 /** Returns the record and removes it. A second take must return null. */
 take(id:string):Promise<PendingBuy|null>;
};

/** A spoken instruction awaiting confirmation. */
export type PendingAction={userId:string;chatId:string;intent:Intent;transcript:string};

export type PendingActionStore={
 put(id:string,value:PendingAction):Promise<void>;
 take(id:string):Promise<PendingAction|null>;
 /** Drop anything this user had pending; a new instruction supersedes. */
 clear(userId:string):Promise<void>;
};

export type Deps={
 app:AppSurface;
 out:Outbox;
 pending:PendingStore;
 /** Token metadata uri to a displayable image url, or null. */
 image(uri:string|null):Promise<string|null>;
 /** A spoken dollar amount as SOL at a live rate, or null when no rate can
  *  be read. Null is a refusal: a trade is never sized off a guessed rate. */
 usdToSol(usd:number):Promise<number|null>;
 /** A spoken buy the exact parser missed, understood by a model, or null.
  *  Only ever a buy, only with an amount that was said, and still confirmed. */
 interpretBuy(transcript:string):Promise<
  {kind:'buyTrending';usd:number}|{kind:'buyTrending';sol:number}
  |{kind:'buyBySymbol';symbol:string;usd:number}|{kind:'buyBySymbol';symbol:string;sol:number}
  |null>;
 /** Which held symbol a spoken name means, chosen only among `held`, or null
  *  when no single one is clear. Never names a token the user does not hold. */
 interpretSell(spokenName:string,held:string[]):Promise<string|null>;
 voice:{
  enabled(userId:string):Promise<boolean>;
  setEnabled(userId:string,on:boolean):Promise<void>;
  /** OGG/Opus bytes, or null when this host cannot synthesise. */
  say(text:string):Promise<Buffer|null>;
  /** A voice note's transcript, or null when it could not be heard. */
  hear(fileId:string):Promise<string|null>;
 };
 pendingAction:PendingActionStore;
};
