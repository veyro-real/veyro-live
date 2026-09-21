import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('the container selects an allow-listed workspace service',async()=>{
 const entry=await readFile('entrypoint.sh','utf8');
 for(const service of ['control-plane','market-worker','telegram-worker','campaign-worker']){
  assert.match(entry,new RegExp(service),service);
 }
 assert.match(entry,/exec su node/);
 // An unknown SERVICE must not reach a shell that would run it.
 assert.match(entry,/exit 64/);
});

test('the control plane migrates before it serves',async()=>{
 const entry=await readFile('entrypoint.sh','utf8');
 const control=entry.slice(entry.indexOf('control-plane)'));
 const migrate=control.indexOf('db:migrate');
 const serve=control.indexOf('server.js');
 assert.ok(migrate>=0,'no migration step');
 assert.ok(migrate<serve,'migrations must run before the server starts');
 assert.match(entry,/set -eu/,'without set -e a failed migration would be ignored');
});

test('the image bakes pnpm in rather than fetching it at boot',async()=>{
 const docker=await readFile('Dockerfile','utf8');
 const root=JSON.parse(await readFile('package.json','utf8'));
 const prepares=docker.match(/corepack prepare (\S+) --activate/g)??[];
 assert.equal(prepares.length,2,'both stages must pin pnpm');
 for(const line of prepares){
  assert.ok(line.includes(root.packageManager),
   `${line} disagrees with packageManager ${root.packageManager}`);
 }
});

test('the image installs from the pnpm lockfile, frozen',async()=>{
 const docker=await readFile('Dockerfile','utf8');
 assert.match(docker,/pnpm-lock\.yaml/);
 assert.match(docker,/pnpm install --frozen-lockfile/);
 assert.doesNotMatch(docker,/npm ci/);
});
