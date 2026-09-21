import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const DEPLOYABLES=['control-plane','market-worker','telegram-worker','campaign-worker'];

test('every deployable declares a start command',async()=>{
 for(const name of DEPLOYABLES){
  const json=JSON.parse(await readFile(`apps/${name}/package.json`,'utf8'));
  assert.equal(json.name,`@veyro/${name}`,name);
  assert.equal(typeof json.scripts.start,'string',name);
 }
});
