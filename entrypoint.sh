#!/bin/sh
set -eu

# One image serves four Railway services. SERVICE names which one this
# container is. Anything not on the list is a deployment mistake, not a
# command to run: refuse it rather than interpolating it into a shell.
SERVICE="${SERVICE:-control-plane}"

case "$SERVICE" in
  control-plane)
    # The traced standalone bundle, not `next start`, which would need the
    # whole dev dependency tree present at runtime.
    CMD='exec node apps/control-plane/.next/standalone/apps/control-plane/server.js'
    ;;
  market-worker|telegram-worker|campaign-worker)
    CMD="exec pnpm --filter @veyro/$SERVICE start"
    ;;
  *)
    echo "entrypoint: unknown SERVICE '$SERVICE'" >&2
    echo "entrypoint: expected control-plane, market-worker, telegram-worker or campaign-worker" >&2
    exit 64
    ;;
esac

exec su node -s /bin/sh -c "$CMD"
