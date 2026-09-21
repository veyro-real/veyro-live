// Schema migrations, applied on deploy.
//
// Running them by hand is a step someone forgets, and the failure lands on a
// user rather than on the deploy. This applies every pending file before the
// control plane serves a request, and refuses to start if one fails — an
// unmigrated database serving traffic is the thing to avoid.
//
// Safe to run concurrently. A Postgres advisory lock serialises instances, so
// a rolling deploy applies each migration exactly once.

import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

export type MigrationFile={name:string;sql:string;checksum:string};
export type AppliedRow={name:string;checksum:string};

/** Arbitrary but fixed: every instance must pick the same lock. */
const LOCK_KEY=8_675_309;

export const checksum=(sql:string):string=>
 createHash('sha256').update(sql).digest('hex').slice(0,32);

/**
 * The files that still need applying, in order.
 *
 * Throws if a file that already ran has since been edited: the database and
 * the repository then disagree about the schema, and skipping the file is how
 * that disagreement goes unnoticed for weeks.
 */
export function pending(files:MigrationFile[],applied:AppliedRow[]):MigrationFile[]{
 const byName=new Map(applied.map(a=>[a.name,a.checksum]));
 const sorted=[...files].sort((a,b)=>a.name.localeCompare(b.name));
 const out:MigrationFile[]=[];
 for(const file of sorted){
  const was=byName.get(file.name);
  if(was===undefined){out.push(file);continue;}
  if(was!==file.checksum){
   throw Error(
    `MIGRATION_EDITED_AFTER_APPLY: ${file.name} has changed since it ran. `+
    'The database and this repository disagree about the schema. Add a new '+
    'migration instead of editing an applied one.');
  }
 }
 return out;
}

/**
 * Supabase offers three connection strings and only two of them work here.
 *
 * The transaction pooler (port 6543) hands a different backend to each
 * transaction, so `pg_advisory_lock` — which is session-scoped — stops
 * serialising anything. Two instances of a rolling deploy would then migrate
 * at the same time, which fails intermittently and looks like a flake.
 *
 * Use the session pooler or the direct connection, both on 5432.
 */
export function checkConnectionMode(url:string):{ok:true}|{ok:false;reason:string}{
 let port:string;
 try{
  port=new URL(url).port;
 }catch{
  return {ok:false,reason:'DATABASE_URL is not a valid URL'};
 }
 if(port==='6543'){
  return {ok:false,reason:
   'DATABASE_URL points at the transaction pooler (port 6543). Migrations '+
   'take a session-scoped advisory lock, which that pooler cannot hold, so '+
   'concurrent deploys would not be serialised. Use the session pooler or '+
   'the direct connection — both on port 5432.'};
 }
 return {ok:true};
}

export async function loadMigrations(dir:string):Promise<MigrationFile[]>{
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql'));
 return Promise.all(names.map(async name=>{
  const sql=await readFile(join(dir,name),'utf8');
  return {name,sql,checksum:checksum(sql)};
 }));
}

/** The bit of node-postgres this needs, named so tests need no database. */
export type SqlClient={
 query(text:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>;
 end():Promise<void>;
};

export async function applyMigrations(
 client:SqlClient,dir:string,log:(line:string)=>void=console.log,
):Promise<{applied:string[]}>{
 await client.query(`create table if not exists public.veyro_migrations(
   name text primary key,
   checksum text not null,
   applied_at timestamptz not null default now()
 )`);

 // Serialises rolling deploys. Released when the connection closes, so a
 // crashed instance cannot hold it.
 await client.query('select pg_advisory_lock($1)',[LOCK_KEY]);
 try{
  const {rows}=await client.query('select name, checksum from public.veyro_migrations');
  const todo=pending(await loadMigrations(dir),rows as AppliedRow[]);
  if(todo.length===0){log('migrations: up to date');return {applied:[]};}

  const applied:string[]=[];
  for(const file of todo){
   log('migrations: applying '+file.name);
   // Each file is its own transaction, so a failure leaves the ones before
   // it applied and recorded rather than rolling back a whole deploy's worth.
   await client.query('begin');
   try{
    await client.query(file.sql);
    await client.query(
     'insert into public.veyro_migrations(name, checksum) values ($1,$2)',
     [file.name,file.checksum]);
    await client.query('commit');
   }catch(e){
    await client.query('rollback');
    throw Error('MIGRATION_FAILED['+file.name+']: '+(e as Error).message);
   }
   applied.push(file.name);
  }
  log('migrations: applied '+applied.length);
  return {applied};
 }finally{
  await client.query('select pg_advisory_unlock($1)',[LOCK_KEY]);
 }
}
