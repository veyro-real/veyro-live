# pnpm workspace migration — parity evidence

Baseline `e14befd` (npm, single package) against the workspace at the head of
`feat/bot-pnpm-monorepo`. The migration's only claim is that nothing changed
except the layout, so each line below is something that was checked rather
than assumed.

| Check | Before | After |
|---|---|---|
| Tests passing | 326 | 331 |
| Test failures | 0 | 0 |
| Routes emitted | 9 | 9, identical |
| `supabase/migrations` | — | byte-for-byte unchanged (`git diff e14befd HEAD` empty) |
| `process.env.*` references | — | none added, none removed, none renamed |
| `VEYRO_TRADING_ENABLED` | off unless `'true'` | unchanged, `packages/bot/src/trade/execute.ts` |
| Control plane health | `/` 200, `/api/health` 503 with 3 probes | same, from the relocated standalone bundle |
| Container user | `su node` | `su node` |
| Lockfiles | `package-lock.json` | `pnpm-lock.yaml`, one, workspace-wide |

The five new tests are the migration's own contract, not new coverage of the
bot: workspace layout, package boundary, four declared entrypoints, and two
Docker contract assertions.

## Routes, both sides

```
/  /_not-found  /admin  /api/action  /api/admin/credentials
/api/health  /api/mcp  /api/state  /api/telegram/webhook
```

## What was not verified

**The Docker image was never built.** Docker was not running on the machine
that did this migration, so `docker build` and `docker run -e SERVICE=bogus`
have not been executed against the new Dockerfile. The entrypoint's allow-list
was verified directly: `SERVICE=bogus` and
`SERVICE='control-plane; rm -rf /'` both exit 64 without reaching a shell.
Build the image before the first Railway deploy from this branch.

**Test files are still not typechecked.** The old root tsconfig globbed
`**/*.ts`, which never matches `.mts`, so no test file has ever been through
`tsc`. `packages/bot/tsconfig.json` keeps that boundary deliberately. Turning
it on surfaces pre-existing type errors in `market-filter`, `strategy-match`
and `x-compose` — worth fixing, and not as part of a migration whose whole
claim is that behavior is unchanged.

**The launch feed is still not running anywhere.** `/api/health` reported it
stale before this migration and still does. Packaging `market-worker` as a
deployable service does not deploy it.
