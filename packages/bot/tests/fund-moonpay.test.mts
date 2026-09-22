import test from 'node:test';import assert from 'node:assert/strict';
const {signQuery,signUrl,onrampLink}=await import('../src/fund/moonpay');

// MoonPay publish this pair so an integration can prove its signing before
// pointing it at real money. If this fails the widget refuses to load and
// does not say why.
test('signing matches MoonPay published test vector',()=>{
 const search='?apiKey=pk_test_DocsVector00&currencyCode=eth'+
  '&walletAddress=0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe';
 assert.equal(signQuery(search,'sk_test_DocsVector00'),
  'oIJxSghyzll/BLhUFdQZhkxf7DAS8REFaWr/ibO+K8Q=');
});

test('the signature is url encoded when appended',()=>{
 const url='https://buy.moonpay.com/?apiKey=pk_test_DocsVector00&currencyCode=eth'+
  '&walletAddress=0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe';
 assert.match(signUrl(url,'sk_test_DocsVector00'),
  /&signature=oIJxSghyzll%2FBLhUFdQZhkxf7DAS8REFaWr%2FibO%2BK8Q%3D$/);
});

// The message signed includes the leading '?'. Getting that wrong is the
// common mistake and produces a signature MoonPay rejects silently.
test('the signed message includes the leading question mark',()=>{
 const withQ=signQuery('?a=1','sk_test');
 const without=signQuery('a=1','sk_test');
 assert.notEqual(withQ,without);
 assert.equal(signQuery(new URL('https://x.test/?a=1').search,'sk_test'),withQ);
});

const withKeys=(fn:()=>void)=>{
 const before={p:process.env.MOONPAY_PUBLISHABLE_KEY,s:process.env.MOONPAY_SECRET_KEY};
 process.env.MOONPAY_PUBLISHABLE_KEY='pk_test_DocsVector00';
 process.env.MOONPAY_SECRET_KEY='sk_test_DocsVector00';
 try{fn();}finally{
  if(before.p===undefined)delete process.env.MOONPAY_PUBLISHABLE_KEY;else process.env.MOONPAY_PUBLISHABLE_KEY=before.p;
  if(before.s===undefined)delete process.env.MOONPAY_SECRET_KEY;else process.env.MOONPAY_SECRET_KEY=before.s;
 }
};

const ADDR='5g3zC6Mo2ST1NndtTsXgUoZuKCF5hcBDpyugihLDZYhP';

test('configured, the address is filled in and the url is signed',()=>{
 withKeys(()=>{
  const link=onrampLink({pubkey:ADDR,usdAmount:10});
  assert.equal(link.prefilled,true);
  assert.match(link.url,new RegExp('walletAddress='+ADDR));
  assert.match(link.url,/currencyCode=sol/);
  assert.match(link.url,/baseCurrencyAmount=10\.00/);
  assert.match(link.url,/&signature=/,'an unsigned url carrying an address will not load');
 });
});

// A missing key must degrade to "paste it yourself", never to an unsigned
// link that fails to open with no explanation.
test('unconfigured, it falls back to the consumer link with no address',()=>{
 const before={p:process.env.MOONPAY_PUBLISHABLE_KEY,s:process.env.MOONPAY_SECRET_KEY};
 delete process.env.MOONPAY_PUBLISHABLE_KEY;delete process.env.MOONPAY_SECRET_KEY;
 try{
  const link=onrampLink({pubkey:ADDR,usdAmount:10});
  assert.equal(link.prefilled,false);
  assert.doesNotMatch(link.url,new RegExp(ADDR),'address leaked into an unsigned link');
  assert.doesNotMatch(link.url,/signature=/);
  assert.match(link.url,/moonpay\.com/);
 }finally{
  if(before.p!==undefined)process.env.MOONPAY_PUBLISHABLE_KEY=before.p;
  if(before.s!==undefined)process.env.MOONPAY_SECRET_KEY=before.s;
 }
});

test('half configured is treated as unconfigured',()=>{
 const before=process.env.MOONPAY_PUBLISHABLE_KEY;
 process.env.MOONPAY_PUBLISHABLE_KEY='pk_test_only';
 delete process.env.MOONPAY_SECRET_KEY;
 try{
  assert.equal(onrampLink({pubkey:ADDR}).prefilled,false,
   'a publishable key alone cannot sign, so the link would not load');
 }finally{
  if(before===undefined)delete process.env.MOONPAY_PUBLISHABLE_KEY;else process.env.MOONPAY_PUBLISHABLE_KEY=before;
 }
});

test('a nonsense amount is omitted rather than sent',()=>{
 withKeys(()=>{
  for(const bad of [0,-5,Number.NaN,Number.POSITIVE_INFINITY]){
   assert.doesNotMatch(onrampLink({pubkey:ADDR,usdAmount:bad}).url,
    /baseCurrencyAmount/,String(bad));
  }
 });
});
