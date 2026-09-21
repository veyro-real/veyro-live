// Applies pending schema migrations. Run automatically on deploy by
// entrypoint.sh, and by hand with `pnpm db:migrate`.
//
// DATABASE_URL is a direct Postgres connection string, which is a different
// credential from SUPABASE_SERVICE_ROLE_KEY: PostgREST cannot run DDL.
// Supabase dashboard -> Settings -> Database -> Connection string (URI).

import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import pg from 'pg';
import {applyMigrations, checkConnectionMode} from '../src/db/migrate.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'supabase', 'migrations');
const url = process.env.DATABASE_URL;

if (!url) {
  // Deliberately not fatal. Until this is set the deploy behaves exactly as
  // it did before migrations were automated, rather than every deploy
  // failing on a missing variable.
  console.warn(
    'migrations: DATABASE_URL is not set, so nothing was applied.\n' +
    'migrations: the schema this build expects may not exist yet.\n' +
    'migrations: set it in Railway to make deploys self-migrating.');
  process.exit(0);
}

const mode = checkConnectionMode(url);
if (!mode.ok) {
  console.error('migrations: ' + mode.reason);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  // Supabase terminates non-TLS connections; its cert chain is not in the
  // slim image's trust store, and the connection is inside Railway's network.
  ssl: {rejectUnauthorized: false},
  statement_timeout: 120_000,
  connectionTimeoutMillis: 30_000,
});

try {
  await client.connect();
  const {applied} = await applyMigrations(client, DIR);
  if (applied.length) console.log('migrations: ' + applied.join(', '));
} catch (e) {
  // Never print the error object: a pg connection error can carry the URL,
  // and the URL carries the password.
  console.error('migrations: FAILED — ' + String(e.message ?? e).slice(0, 500));
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
