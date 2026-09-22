process.env.VEYRO_STORE='memory';
import test from 'node:test';import assert from 'node:assert/strict';
import {paperBuy,paperSell,PAPER_START_LAMPORTS} from '../src/trade/paper';
import type {Position} from '../src/types';

const MINT='Gs4MZmALhnwt6B25XX3u8kbE9EzzdH2a8zT1E6Njpump';

function deps(over:Partial<Parameters<typeof paperBuy>[1]>={}){
 const saved:Position[]=[];
 let balance=PAPER_START_LAMPORTS;
 return {
  saved,
  get balance(){return balance;},
  d:{
   quote:async(_i:string,_o:string,amount:bigint)=>({outAmount:(amount*1000n).toString()}),
   paperBalance:async()=>balance,
   setPaperBalance:async(_u:string,v:bigint)=>{balance=v;},
   open:async(p:{mint:string;symbol:string;entryLamports:bigint})=>{
    const pos={id:'p'+saved.length,userId:'u1',mint:p.mint,symbol:p.symbol,status:'OPEN',
     entrySignature:null,entryLamports:p.entryLamports.toString(),tokensReceived:null,
     exitSignature:null,exitLamports:null,reason:'PAPER_FILL',openedAt:'',closedAt:null} as Position;
    saved.push(pos);return pos;
   },
   update:async(id:string,patch:Partial<Position>)=>{
    const i=saved.findIndex(p=>p.id===id);saved[i]={...saved[i]!,...patch};return saved[i]!;
   },
   find:async(id:string)=>saved.find(p=>p.id===id)??null,
   ...over,
  },
 };
}

test('a paper buy fills at the real quote and never carries a signature',async()=>{
 const h=deps();
 const out=await paperBuy('u1',MINT,100_000_000n,'LMAO',h.d as never);
 assert.equal(out.result.ok,true);
 assert.equal(out.position.tokensReceived,(100_000_000n*1000n).toString());
 assert.equal(out.position.entrySignature,null,'a simulated fill has no transaction');
 assert.equal(out.result.signature,null);
});

test('a paper buy debits the simulated balance and nothing else',async()=>{
 const h=deps();
 await paperBuy('u1',MINT,100_000_000n,'LMAO',h.d as never);
 assert.equal(h.balance,PAPER_START_LAMPORTS-100_000_000n);
});

test('a paper buy beyond the simulated balance is refused, not overdrawn',async()=>{
 const h=deps();
 const out=await paperBuy('u1',MINT,PAPER_START_LAMPORTS+1n,'LMAO',h.d as never);
 assert.equal(out.result.ok,false);
 assert.equal(out.position.reason,'PAPER_INSUFFICIENT_BALANCE');
 assert.equal(h.balance,PAPER_START_LAMPORTS,'a refused buy must not move the balance');
});

test('a paper sell credits the proceeds at the quoted price',async()=>{
 const h=deps();
 const bought=await paperBuy('u1',MINT,100_000_000n,'LMAO',h.d as never);
 const after=h.balance;
 const sold=await paperSell('u1',bought.position.id,h.d as never);
 assert.equal(sold.result.ok,true);
 assert.equal(sold.position.status,'CLOSED');
 assert.equal(sold.position.exitSignature,null);
 // tokens * 1000 under the stub quote, so the round trip returns more than it cost.
 assert.equal(h.balance,after+BigInt(sold.position.exitLamports!));
});

test('a quote that fails leaves the balance untouched and says why',async()=>{
 const h=deps({quote:async()=>{throw Error('JUPITER_HTTP_429');}});
 const out=await paperBuy('u1',MINT,100_000_000n,'LMAO',h.d as never);
 assert.equal(out.result.ok,false);
 assert.match(out.position.reason,/QUOTE/);
 assert.equal(h.balance,PAPER_START_LAMPORTS);
});

import {report} from '../src/telegram/handlers';
import {mode as renderMode} from '../src/telegram/render';

test('a paper fill is never reported with a signature',async()=>{
 const h=deps();
 const out=await paperBuy('u1',MINT,100_000_000n,'LMAO',h.d as never);
 const text=report(out,'Bought');
 assert.doesNotMatch(text,/Signature/i);
 assert.doesNotMatch(text,/null/);
 assert.match(text,/paper/i);
 assert.match(text,/no transaction|No transaction/);
});

test('a live fill still reports its signature',()=>{
 const text=report({
  position:{id:'p1',symbol:'LMAO',paper:false} as never,
  result:{ok:true,signature:'5xSig',outAmount:'1'},
 } as never,'Bought');
 assert.match(text,/Signature: 5xSig/);
});

test('paper mode tells the user the prices are real and the money is not',()=>{
 const text=renderMode('paper','5000000000');
 assert.match(text,/simulated/i);
 assert.match(text,/5 SOL/);
 assert.doesNotMatch(text,/guaranteed|profit/i);
});

test('live mode says it spends real SOL and how to stop it',()=>{
 const text=renderMode('live','0');
 assert.match(text,/real SOL/i);
 assert.match(text,/revoke/i);
 assert.match(text,/limits/i);
});

// Already holding a token is an answer, not a fault. Thrown, it reaches the
// router as "something went wrong on our side" and tells the user to retry
// something that can never succeed.
test('a second buy of a token already held is refused, not thrown',async()=>{
 const deps={
  quote:async()=>({outAmount:'1000'}),
  paperBalance:async()=>5_000_000_000n,
  setPaperBalance:async()=>{},
  open:async()=>{throw Error('duplicate key value violates unique constraint "veyro_positions_one_open_per_mint"');},
  update:async()=>{throw Error('should not be reached');},
  find:async()=>null,
 };
 const out=await paperBuy('u-1','MintAAA',1_000_000n,'AAA',deps as any);
 assert.equal(out.result.ok,false);
 assert.equal(out.result.reason,'POSITION_ALREADY_OPEN');
});

test('the paper balance is not debited when the position cannot open',async()=>{
 let debited=false;
 const deps={
  quote:async()=>({outAmount:'1000'}),
  paperBalance:async()=>5_000_000_000n,
  setPaperBalance:async()=>{debited=true;},
  open:async()=>{throw Error('POSITION_ALREADY_OPEN');},
  update:async()=>{throw Error('should not be reached');},
  find:async()=>null,
 };
 await paperBuy('u-1','MintAAA',1_000_000n,'AAA',deps as any);
 assert.equal(debited,false,'simulated funds were taken for a trade that never opened');
});
