import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('workspace includes applications and packages', async()=>{
 const yaml=await readFile('pnpm-workspace.yaml','utf8');
 assert.match(yaml,/apps\/\*/);
 assert.match(yaml,/packages\/\*/);
 const root=JSON.parse(await readFile('package.json','utf8'));
 assert.equal(root.packageManager,'pnpm@10.17.1');
 assert.equal(root.engines.node,'>=22');
});
