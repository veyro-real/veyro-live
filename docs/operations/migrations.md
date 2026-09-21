# Migrations

Schema changes apply themselves on deploy. Add a numbered `.sql` file to
`supabase/migrations/` and ship; the control plane applies it before it
serves its first request.

## One-time setup

Set `DATABASE_URL` on the `veyro-live` Railway service. Supabase dashboard →
Settings → Database → Connection string (URI), with the real password
substituted for `[YOUR-PASSWORD]`.

This is a different credential from `SUPABASE_SERVICE_ROLE_KEY`. That key
talks to PostgREST, which cannot run DDL; migrations need a direct Postgres
connection.

### Which of the three connection strings

Supabase offers three. Two work.

| String | Port | Use it? |
|---|---|---|
| Session pooler | 5432 | **Yes** — IPv4, and holds a session lock |
| Direct connection | 5432 | Yes, but IPv6-only on newer projects |
| Transaction pooler | 6543 | **No** |

The transaction pooler hands each transaction a different backend, so the
session-scoped `pg_advisory_lock` this runner takes stops serialising
anything and two instances of a rolling deploy could migrate at once. The
runner rejects port 6543 before connecting rather than letting that become an
intermittent race.

### The password is not recoverable

Supabase does not store it retrievably. If it is not in your password
manager, reset it: dashboard → Settings → Database → Reset database password.
Resetting is safe here — nothing else in this project uses it. The app talks
to PostgREST with `SUPABASE_SERVICE_ROLE_KEY`, and the CLI's keychain entry
is not a usable API token.

Until it is set, `pnpm db:migrate` warns and exits 0 rather than failing. That
keeps deploys working exactly as they did before this existed, at the cost of
the schema possibly lagging the code.

## What runs, and when

`entrypoint.sh` runs `pnpm db:migrate` for `SERVICE=control-plane` only,
before starting the server, as root so pnpm is on PATH. `set -e` means a
failed migration stops the container: serving against an unmigrated schema is
worse than not serving.

Workers do not migrate. Exactly one service should, and a worker that starts
before the control plane would otherwise race it.

## How it behaves

- **Order** is by filename, so keep the numeric prefix.
- **Each file is its own transaction.** A failure leaves earlier files applied
  and recorded rather than discarding a whole deploy's work.
- **Concurrency** is handled by a Postgres advisory lock, so a rolling deploy
  applies each file exactly once. The lock releases with the connection, so a
  crashed instance cannot hold it.
- **Applied files are tracked** in `veyro_migrations` by name and checksum.
- **Editing an applied migration is refused.** If a file's checksum no longer
  matches what ran, the deploy fails and says so. The database and the
  repository disagreeing about the schema is the bug; skipping the file
  quietly is how that survives for weeks. Add a new migration instead.

## Running it by hand

```
DATABASE_URL='...' pnpm db:migrate
```

Idempotent — applying twice is a no-op.

## What it never prints

A pg connection error can carry the connection string, and the connection
string carries the password. The runner prints `e.message` truncated, never
the error object.
