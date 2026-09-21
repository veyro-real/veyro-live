import test from 'node:test';import assert from 'node:assert/strict';
const {flowFeatures}=await import('../src/market/flow');
import type {Trade} from '../src/market/trades';

const T0=1_000_000_000_000;
const MINT='M';
const t=(o:Partial<Trade>&{trader:string;at:number}):Trade=>({
 mint:MINT,side:'buy',solAmount:0.1,tokenAmount:1000,curveSol:30,marketCapSol:40,...o,
});
const win={windowStart:T0,windowEnd:T0+30_000};

test('an empty window reports nothing rather than dividing by zero',()=>{
 const f=flowFeatures([],win);
 assert.equal(f.trades,0);
 assert.equal(f.uniqueBuyers,0);
 assert.equal(f.netSol,0);
 assert.equal(f.medianBuySol,null);
 assert.equal(f.topBuyerSharePct,null);
 assert.equal(f.buyerAcceleration,null);
 assert.equal(f.tradeSizeEntropy,null);
});

test('buys and sells are counted and netted separately',()=>{
 const f=flowFeatures([
  t({trader:'a',at:T0+1000,solAmount:1}),
  t({trader:'b',at:T0+2000,solAmount:2}),
  t({trader:'c',at:T0+3000,solAmount:0.5,side:'sell'}),
 ],win);
 assert.equal(f.buys,2);assert.equal(f.sells,1);
 assert.equal(f.buySol,3);assert.equal(f.sellSol,0.5);
 assert.equal(f.netSol,2.5);
 assert.equal(f.uniqueBuyers,2);assert.equal(f.uniqueSellers,1);
});

test('one wallet buying repeatedly is one buyer, not many',()=>{
 const f=flowFeatures([
  t({trader:'a',at:T0+1000}),t({trader:'a',at:T0+2000}),t({trader:'a',at:T0+3000}),
 ],win);
 assert.equal(f.trades,3);
 assert.equal(f.uniqueBuyers,1);
 assert.equal(f.repeatBuyerPct,100);
});

test('concentration of buy volume in one wallet is surfaced',()=>{
 const f=flowFeatures([
  t({trader:'whale',at:T0+1000,solAmount:9}),
  t({trader:'b',at:T0+2000,solAmount:0.5}),
  t({trader:'c',at:T0+3000,solAmount:0.5}),
 ],win);
 assert.equal(f.topBuyerSharePct,90);
});

test('buyer acceleration is positive when new wallets keep arriving',()=>{
 const early=[t({trader:'a',at:T0+1000}),t({trader:'b',at:T0+2000})];
 const late=['c','d','e','f'].map((x,i)=>t({trader:x,at:T0+20_000+i*100}));
 assert.ok(flowFeatures([...early,...late],win).buyerAcceleration!>0);
});

test('buyer acceleration is negative when arrivals dry up',()=>{
 const early=['a','b','c','d'].map((x,i)=>t({trader:x,at:T0+1000+i*100}));
 const late=[t({trader:'e',at:T0+25_000})];
 assert.ok(flowFeatures([...early,...late],win).buyerAcceleration!<0);
});

test('identical trade sizes score as low diversity',()=>{
 const same=['a','b','c','d','e','f'].map((x,i)=>t({trader:x,at:T0+i*1000,solAmount:0.5}));
 const varied=['a','b','c','d','e','f'].map((x,i)=>t({trader:x,at:T0+i*1000,solAmount:[0.01,0.08,0.3,1.2,4,15][i]}));
 const a=flowFeatures(same,win).tradeSizeEntropy!;
 const b=flowFeatures(varied,win).tradeSizeEntropy!;
 assert.equal(a,0,'one bucket is zero entropy');
 assert.ok(b>0.8,'a wide spread should read as diverse, got '+b);
});

test('the median buy ignores sells and resists one whale',()=>{
 const f=flowFeatures([
  t({trader:'a',at:T0+1000,solAmount:0.1}),
  t({trader:'b',at:T0+2000,solAmount:0.2}),
  t({trader:'c',at:T0+3000,solAmount:0.3}),
  t({trader:'w',at:T0+4000,solAmount:100}),
  t({trader:'s',at:T0+5000,solAmount:50,side:'sell'}),
 ],win);
 assert.equal(f.medianBuySol,0.25);
});

test('the creator selling is reported as negative net, which is the hard tell',()=>{
 const f=flowFeatures([
  t({trader:'dev',at:T0+1000,solAmount:2}),
  t({trader:'dev',at:T0+5000,solAmount:5,side:'sell'}),
  t({trader:'b',at:T0+6000,solAmount:1}),
 ],{...win,creator:'dev'});
 assert.equal(f.creatorNetSol,-3);
});

test('with no creator given, creator flow is unknown rather than zero',()=>{
 assert.equal(flowFeatures([t({trader:'a',at:T0+1000})],win).creatorNetSol,null);
});

test('curve progress is the growth across the window, not its level',()=>{
 const f=flowFeatures([
  t({trader:'a',at:T0+1000,curveSol:30}),
  t({trader:'b',at:T0+9000,curveSol:38.5}),
 ],win);
 assert.equal(f.curveProgressSol,8.5);
});

test('buyer velocity is per second over the window actually observed',()=>{
 const f=flowFeatures(['a','b','c'].map((x,i)=>t({trader:x,at:T0+i*1000})),
  {windowStart:T0,windowEnd:T0+30_000});
 assert.ok(Math.abs(f.buyerVelocity!-0.1)<1e-9,'3 buyers over 30s: '+f.buyerVelocity);
});

test('trades outside the window are not counted',()=>{
 const f=flowFeatures([
  t({trader:'early',at:T0-5000}),
  t({trader:'inside',at:T0+1000}),
  t({trader:'late',at:T0+60_000}),
 ],win);
 assert.equal(f.trades,1);
 assert.equal(f.uniqueBuyers,1);
});
