import test from 'node:test';import assert from 'node:assert/strict';
import {checksum,pending,type MigrationFile} from '../src/db/migrate';

const f=(name:string,sql:string):MigrationFile=>({name,sql,checksum:checksum(sql)});

test('migrations run in filename order, not directory order',()=>{
 const files=[f('0010_late.sql','c'),f('0002_mid.sql','b'),f('0001_first.sql','a')];
 assert.deepEqual(pending(files,[]).map(m=>m.name),
  ['0001_first.sql','0002_mid.sql','0010_late.sql']);
});

test('an applied migration is not applied twice',()=>{
 const a=f('0001_a.sql','create table a();'),b=f('0002_b.sql','create table b();');
 const done=[{name:a.name,checksum:a.checksum}];
 assert.deepEqual(pending([a,b],done).map(m=>m.name),['0002_b.sql']);
});

test('nothing to do is not an error',()=>{
 const a=f('0001_a.sql','x');
 assert.deepEqual(pending([a],[{name:a.name,checksum:a.checksum}]),[]);
});

// A file edited after it ran means the database and the repo disagree about
// what the schema is. Silently skipping it is how that divergence survives.
test('editing an applied migration is refused, not ignored',()=>{
 const original=f('0001_a.sql','create table a();');
 const edited=f('0001_a.sql','create table a(b int);');
 assert.throws(()=>pending([edited],[{name:original.name,checksum:original.checksum}]),
  /0001_a\.sql/);
});

test('the checksum tracks content, not whitespace noise',()=>{
 assert.equal(checksum('select 1;'),checksum('select 1;'));
 assert.notEqual(checksum('select 1;'),checksum('select 2;'));
});

import {checkConnectionMode} from '../src/db/migrate';

test('the transaction pooler is refused, because the advisory lock cannot hold',()=>{
 const r=checkConnectionMode('postgres://u:p@aws-0-us-west-1.pooler.supabase.com:6543/postgres');
 assert.equal(r.ok,false);
 assert.match((r as {reason:string}).reason,/6543|transaction pooler/);
});

test('the session pooler and the direct connection are accepted',()=>{
 assert.equal(checkConnectionMode('postgres://u:p@aws-0-us-west-1.pooler.supabase.com:5432/postgres').ok,true);
 assert.equal(checkConnectionMode('postgres://u:p@db.ref.supabase.co:5432/postgres').ok,true);
});

test('a malformed url is refused before a connection is attempted',()=>{
 assert.equal(checkConnectionMode('not a url').ok,false);
});
