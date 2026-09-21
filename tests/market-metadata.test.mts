import test from 'node:test';import assert from 'node:assert/strict';
const {resolveImage,ipfsToHttps}=await import('../lib/market/metadata');

const json=(body:unknown,status=200)=>((async()=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})) as unknown as typeof fetch);

test('an ipfs uri is rewritten to a gateway',()=>{
 assert.equal(ipfsToHttps('ipfs://QmAbc123'),'https://ipfs.io/ipfs/QmAbc123');
 assert.equal(ipfsToHttps('https://example.com/x.json'),'https://example.com/x.json');
 assert.equal(ipfsToHttps(''),null);
});

test('the image field is read out of the metadata',async()=>{
 const url=await resolveImage('https://x/meta.json',{fetch:json({name:'dogwifhat',image:'https://cdn/x.png'})});
 assert.equal(url,'https://cdn/x.png');
});

test('an ipfs image inside the metadata is also rewritten',async()=>{
 const url=await resolveImage('https://x/meta.json',{fetch:json({image:'ipfs://QmPic'})});
 assert.equal(url,'https://ipfs.io/ipfs/QmPic');
});

test('no uri means no image, without a network call',async()=>{
 let called=false;
 const f=(async()=>{called=true;return new Response('{}');}) as unknown as typeof fetch;
 assert.equal(await resolveImage(null,{fetch:f}),null);
 assert.equal(called,false);
});

test('metadata without an image is null rather than an error',async()=>{
 assert.equal(await resolveImage('https://x/meta.json',{fetch:json({name:'no picture here'})}),null);
});

test('a failed or non-JSON fetch is null, never a throw',async()=>{
 const boom=(async()=>{throw Error('ENOTFOUND');}) as unknown as typeof fetch;
 assert.equal(await resolveImage('https://x/meta.json',{fetch:boom}),null);
 const notJson=(async()=>new Response('<html>nope</html>',{headers:{'content-type':'text/html'}})) as unknown as typeof fetch;
 assert.equal(await resolveImage('https://x/meta.json',{fetch:notJson}),null);
 assert.equal(await resolveImage('https://x/meta.json',{fetch:json({},404)}),null);
});

test('only http and https images are returned, never a local or data uri',async()=>{
 for(const bad of ['file:///etc/passwd','data:image/png;base64,AAAA','javascript:alert(1)']){
  assert.equal(await resolveImage('https://x/meta.json',{fetch:json({image:bad})}),null,bad);
 }
});
