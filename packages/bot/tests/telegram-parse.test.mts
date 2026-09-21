import test from 'node:test';import assert from 'node:assert/strict';
const {parseCommand}=await import('../src/telegram/parse');

const MINT='Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

test('bare commands parse to their kind',()=>{
 for(const c of ['start','help','connect','wallet','revoke']){
  assert.equal(parseCommand('/'+c).kind,c);
 }
});

test('a bot mention suffix is stripped',()=>{
 assert.equal(parseCommand('/wallet@VeyroTradingBot').kind,'wallet');
});

test('text that is not a command is unknown',()=>{
 assert.equal(parseCommand('hello there').kind,'unknown');
 assert.equal(parseCommand('').kind,'unknown');
});

test('limits with no arguments reads rather than writes',()=>{
 const c=parseCommand('/limits');
 assert.equal(c.kind,'limits');
 assert.equal(c.kind==='limits'&&c.set,null);
});

test('limits parses max trade, daily cap and hours',()=>{
 const c=parseCommand('/limits 0.5 2 24');
 assert.deepEqual(c,{kind:'limits',set:{maxTradeSol:0.5,dailyCapSol:2,hours:24}});
});

test('limits rejects a daily cap below the per-trade max',()=>{
 assert.equal(parseCommand('/limits 5 1 24').kind,'usage');
});

test('limits rejects non-numeric, negative and partial arguments',()=>{
 for(const t of ['/limits abc 2 24','/limits -1 2 24','/limits 0.5 2','/limits 0.5 2 0']){
  assert.equal(parseCommand(t).kind,'usage',t);
 }
});

test('buy needs a valid mint and a positive amount',()=>{
 assert.deepEqual(parseCommand('/buy '+MINT+' 0.25'),{kind:'buy',mint:MINT,sol:0.25});
 for(const t of ['/buy','/buy '+MINT,'/buy notamint 0.25','/buy '+MINT+' 0','/buy '+MINT+' -1','/buy '+MINT+' abc']){
  assert.equal(parseCommand(t).kind,'usage',t);
 }
});

test('why needs a valid mint',()=>{
 assert.deepEqual(parseCommand('/why '+MINT),{kind:'why',mint:MINT});
 assert.equal(parseCommand('/why').kind,'usage');
 assert.equal(parseCommand('/why nope').kind,'usage');
});

test('scan defaults to ten and clamps to a sane range',()=>{
 assert.deepEqual(parseCommand('/scan'),{kind:'scan',limit:10});
 assert.deepEqual(parseCommand('/scan 3'),{kind:'scan',limit:3});
 assert.deepEqual(parseCommand('/scan 500'),{kind:'scan',limit:25});
 assert.deepEqual(parseCommand('/scan 0'),{kind:'scan',limit:1});
});

test('positions includes closed only when asked',()=>{
 assert.deepEqual(parseCommand('/positions'),{kind:'positions',includeClosed:false});
 assert.deepEqual(parseCommand('/positions all'),{kind:'positions',includeClosed:true});
});

test('edge with no text reads the current strategy',()=>{
 assert.deepEqual(parseCommand('/edge'),{kind:'edge',text:null});
});

test('edge keeps the users words verbatim',()=>{
 const words='only buy tokens  under 30s old with LP locked';
 assert.deepEqual(parseCommand('/edge '+words),{kind:'edge',text:words});
});

test('sell needs a position id',()=>{
 const id='6f1b8c3e-9a2d-4c55-8f0e-1b2c3d4e5f60';
 assert.deepEqual(parseCommand('/sell '+id),{kind:'sell',positionId:id});
 assert.equal(parseCommand('/sell').kind,'usage');
 assert.equal(parseCommand('/sell 123').kind,'usage');
});

test('voice toggles, and can be set explicitly',()=>{
 assert.deepEqual(parseCommand('/voice'),{kind:'voice',on:null});
 assert.deepEqual(parseCommand('/voice on'),{kind:'voice',on:true});
 assert.deepEqual(parseCommand('/voice off'),{kind:'voice',on:false});
 assert.equal(parseCommand('/voice maybe').kind,'usage');
});

test('chatid is a command, so a group can identify itself',()=>{
 assert.deepEqual(parseCommand('/chatid'),{kind:'chatid'});
 assert.deepEqual(parseCommand('/chatid@theveyrobotbot'),{kind:'chatid'});
});

test('trending is a command with an optional count',()=>{
 assert.deepEqual(parseCommand('/trending'),{kind:'trending',limit:5});
 assert.deepEqual(parseCommand('/trending 3'),{kind:'trending',limit:3});
 assert.deepEqual(parseCommand('/trending 99'),{kind:'trending',limit:10});
});
