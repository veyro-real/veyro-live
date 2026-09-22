// Sets a Railway variable without the value passing through argv or shell
// history. Reads it from stdin — piped, or typed at the silent prompt.
//
//   node scripts/set-railway-var.mjs DATABASE_URL
//   pbpaste | node scripts/set-railway-var.mjs DATABASE_URL
//
// `railway variables --set "K=v"` puts the secret in the process list and in
// your history file. This does not.

import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {createInterface} from 'node:readline';

const name = process.argv[2];
if (!name) { console.error('usage: node scripts/set-railway-var.mjs <NAME>'); process.exit(64); }

const IDS = {
  projectId: '3376d5e0-2655-460a-b1f9-318a296011f2',
  environmentId: 'd6e51e1c-e229-44fe-a740-5af40e9823a1',
  serviceId: 'e6741775-00f5-40c4-adeb-954237fd0fce', // veyro-live
};

async function readValue() {
  if (!process.stdin.isTTY) {
    let data = '';
    for await (const chunk of process.stdin) data += chunk;
    return data.trim();
  }
  process.stderr.write(`${name} (input hidden): `);
  const rl = createInterface({input: process.stdin, output: process.stderr, terminal: true});
  rl.output.write = () => true; // swallow the echo
  const value = await new Promise(res => rl.question('', a => { rl.close(); res(a); }));
  process.stderr.write('\n');
  return value.trim();
}

const value = await readValue();
if (!value) { console.error('nothing on stdin'); process.exit(64); }

// Catch the mistake that matters before it is stored. The transaction pooler
// cannot hold the session-scoped advisory lock migrations take.
if (name === 'DATABASE_URL') {
  let port;
  try { port = new URL(value).port; } catch { console.error('not a valid URL'); process.exit(64); }
  if (port === '6543') {
    console.error('refused: that is the transaction pooler (6543). Migrations take a');
    console.error('session-scoped advisory lock it cannot hold. Use the session pooler');
    console.error('or the direct connection, both on 5432.');
    process.exit(64);
  }
  if (port !== '5432') console.error(`note: port ${port || '(none)'} — expected 5432.`);
}

const token = JSON.parse(readFileSync(`${homedir()}/.railway/config.json`, 'utf8')).user.token;
const res = await fetch('https://backboard.railway.com/graphql/v2', {
  method: 'POST',
  headers: {'content-type': 'application/json', Authorization: `Bearer ${token}`},
  body: JSON.stringify({
    query: `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
    variables: {input: {...IDS, name, value, skipDeploys: true}},
  }),
}).then(r => r.json());

if (res.errors) { console.error('failed: ' + JSON.stringify(res.errors[0].message).slice(0, 200)); process.exit(1); }
console.log(`${name} set on veyro-live (${value.length} chars). Deploy to apply.`);
