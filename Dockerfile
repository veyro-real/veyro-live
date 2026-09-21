# One image, four services. SERVICE picks which one runs; see
# docs/operations/workspace-services.md.
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

# Manifests first: these change far less often than source, so the install
# layer survives most rebuilds.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/control-plane/package.json apps/control-plane/
COPY apps/market-worker/package.json apps/market-worker/
COPY apps/telegram-worker/package.json apps/telegram-worker/
COPY apps/campaign-worker/package.json apps/campaign-worker/
COPY packages/bot/package.json packages/bot/
COPY vendor/veyro-core/package.json vendor/veyro-core/
COPY vendor/veyro-sdk/package.json vendor/veyro-sdk/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# --activate bakes the binary in. Without it corepack fetches pnpm from
# npmjs on every container start, putting a network round trip and a
# supply-chain download on the boot path of a production service.
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

# The workers run from source through tsx, so they need the installed
# workspace rather than the control plane's traced bundle.
COPY --from=build --chown=node:node /app /app

# Next traces a monorepo-shaped standalone bundle; static assets and public/
# are not part of it.
COPY --from=build --chown=node:node /app/apps/control-plane/.next/static \
  /app/apps/control-plane/.next/standalone/apps/control-plane/.next/static
COPY --from=build --chown=node:node /app/apps/control-plane/public \
  /app/apps/control-plane/.next/standalone/apps/control-plane/public

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod 755 /app/entrypoint.sh
EXPOSE 3000
CMD ["/app/entrypoint.sh"]
