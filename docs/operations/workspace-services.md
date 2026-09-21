# Workspace services

One repository, one image, four Railway services. Each sets `SERVICE` to pick
which process it runs; `entrypoint.sh` refuses anything else with exit 64.

| `SERVICE` | Workspace | Runs | Health |
|---|---|---|---|
| `control-plane` (default) | `@veyro/control-plane` | The traced Next standalone server on `0.0.0.0:$PORT` | Railway checks `/` |
| `market-worker` | `@veyro/market-worker` | The launch feed, `src/main.ts` via tsx | None; liveness is the feed heartbeat |
| `telegram-worker` | `@veyro/telegram-worker` | Placeholder: logs and exits 0 | None |
| `campaign-worker` | `@veyro/campaign-worker` | Placeholder: logs and exits 0 | None |

## Why Railway still health-checks `/` and not `/api/health`

`/api/health` returns 503 when Supabase, the RPC or the launch feed is
unhealthy. That is the right answer for a status page and the wrong one for a
container probe: a Supabase hiccup would restart a control plane that is itself
fine, and a restart loop would take down the webhook with it.

`/` is the liveness check — is this process serving? `/api/health` is the
readiness and diagnostics view, and status.veyro.wtf is what reads it. Keep
them separate.

## Deploying a new service

1. Create the Railway service against this repository.
2. Set `SERVICE` to one of the four values above.
3. Leave the start command empty; the image's entrypoint handles it.
4. Only `control-plane` needs a port or a domain.

An unset `SERVICE` defaults to `control-plane`, so an existing service keeps
working without being reconfigured.

## The placeholder workers

`telegram-worker` and `campaign-worker` log
`worker disabled: implementation plan not yet applied` and exit 0. They are
deployable so the topology is real, and inert so nothing polls, trades or
mutates state before their feature plans land. Do not point traffic at them.
