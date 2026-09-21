# Bot pnpm Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert only the `veyro-live` bot repository into a pnpm workspace without changing runtime behavior.

**Architecture:** The Next.js control plane lives in `apps/control-plane`; worker entry points live in their own workspace applications; existing domain code first moves intact into `packages/bot`. Later plans split new responsibilities into focused packages without forcing a risky all-at-once rewrite.

**Tech Stack:** pnpm 10, Node.js 22, TypeScript 5.9, Next.js 16, React 19, Node test runner, Docker BuildKit.

**Spec:** `docs/superpowers/specs/2026-09-21-telegram-trading-agent-design.md`

## Global Constraints

- Modify only `/Users/jeremy/Development/Veyro/veyro-live`.
- Preserve every existing HTTP route, environment-variable name, database schema, test assertion, and production behavior.
- Keep one lockfile and one root command surface: `pnpm build`, `pnpm typecheck`, and `pnpm test`.
- Do not run package-manager or deployment commands that rewrite `.env*`; if uncertain, wrap them with `node ~/.agents/bin/env-guard.mjs run --allow <expected-file> -- <command>`.
- Do not modify the existing untracked `supabase/.gitignore`, `supabase/config.toml`, or `supabase/seed.sql`.

## Review Focus

- Next standalone output must still include the local `vendor/veyro-core` and `vendor/veyro-sdk` packages.
- Tests importing old `../lib/*` paths must either move atomically or use an explicit compatibility mapping during the migration.
- Docker must install from `pnpm-lock.yaml` with a frozen lockfile and run as the non-root `node` user.
- Railway must still bind the control plane to `0.0.0.0:$PORT` and execute the existing health path.
- Workspace commands must fail if one package fails; filtered commands must not hide a broken worker.

---

### Task 1: Establish the workspace command surface

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Modify: `package.json`
- Create: `tsconfig.base.json`
- Test: `tests/workspace-layout.test.mts`

**Interfaces:**
- Consumes: the current root npm scripts and TypeScript options.
- Produces: root commands `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm --filter <workspace> <script>`.

- [ ] **Step 1: Write the failing workspace-layout test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('workspace includes applications and packages', async()=>{
 const yaml=await readFile('pnpm-workspace.yaml','utf8');
 assert.match(yaml,/apps\/\*/);
 assert.match(yaml,/packages\/\*/);
 const root=JSON.parse(await readFile('package.json','utf8'));
 assert.equal(root.packageManager,'pnpm@10.17.1');
 assert.equal(root.engines.node,'>=22 <23');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --import tsx --test tests/workspace-layout.test.mts`

Expected: FAIL because `pnpm-workspace.yaml` does not exist.

- [ ] **Step 3: Add the workspace manifests**

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
  - vendor/*
```

```ini
# .npmrc
engine-strict=true
link-workspace-packages=true
shared-workspace-lockfile=true
```

Set the root package to `private: true`, `packageManager: "pnpm@10.17.1"`, `engines.node: ">=22 <23"`, and scripts that run `pnpm -r --if-present build`, `pnpm -r --if-present typecheck`, and `pnpm -r --if-present test`. Move the current compiler options unchanged into `tsconfig.base.json` except for package-specific `include` arrays.

- [ ] **Step 4: Install and run the focused test**

Run: `corepack enable && pnpm install`

Run: `pnpm exec tsx --test tests/workspace-layout.test.mts`

Expected: PASS and a new `pnpm-lock.yaml`; `package-lock.json` is removed only after the frozen pnpm install succeeds.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc tsconfig.base.json pnpm-lock.yaml tests/workspace-layout.test.mts package-lock.json
git commit -m "build: establish bot pnpm workspace"
```

### Task 2: Move the existing bot library without behavior changes

**Files:**
- Create: `packages/bot/package.json`
- Create: `packages/bot/tsconfig.json`
- Move: `lib/**` to `packages/bot/src/**`
- Move: `tests/**` to `packages/bot/tests/**`
- Modify: imports in `packages/bot/tests/*.test.mts`

**Interfaces:**
- Consumes: every export currently reachable below `lib/`.
- Produces: workspace package `@veyro/bot` with explicit subpath exports `./app`, `./telegram/*`, `./trade/*`, `./market/*`, `./voice/*`, `./strategy/*`, and `./types`.

- [ ] **Step 1: Add a failing package-boundary test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {intentFromText} from '@veyro/bot/telegram/intent';

test('bot subpath exports resolve',()=>{
 assert.equal(typeof intentFromText,'function');
});
```

- [ ] **Step 2: Run it and verify resolution fails**

Run: `pnpm exec tsx --test packages/bot/tests/package-boundary.test.mts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `@veyro/bot`.

- [ ] **Step 3: Add the package and move sources mechanically**

Use a package manifest with `type: "module"`, `exports: {"./*":"./src/*.ts"}`, the current runtime dependencies, and scripts `test: "node --import tsx --test tests/*.test.mts"` and `typecheck: "tsc --noEmit"`. Move files with `git mv`, preserve their contents, then update test imports from `../lib/` to `../src/` except the package-boundary test.

- [ ] **Step 4: Prove behavior parity**

Run: `pnpm --filter @veyro/bot typecheck`

Run: `pnpm --filter @veyro/bot test`

Expected: all existing bot tests plus `package-boundary.test.mts` pass with the same assertion count as before the move plus one.

- [ ] **Step 5: Commit**

```bash
git add packages/bot lib tests
git commit -m "refactor: move bot domain into workspace package"
```

### Task 3: Move the control plane and isolate worker applications

**Files:**
- Create: `apps/control-plane/package.json`
- Create: `apps/control-plane/tsconfig.json`
- Move: `app/**`, `next.config.ts`, `next-env.d.ts` to `apps/control-plane/`
- Create: `apps/market-worker/package.json`
- Create: `apps/market-worker/tsconfig.json`
- Move: `worker/feed.ts` to `apps/market-worker/src/main.ts`
- Create: `apps/telegram-worker/package.json`
- Create: `apps/telegram-worker/src/main.ts`
- Create: `apps/campaign-worker/package.json`
- Create: `apps/campaign-worker/src/main.ts`
- Test: `packages/bot/tests/workspace-entrypoints.test.mts`

**Interfaces:**
- Consumes: `@veyro/bot` subpath exports and existing Next route contracts.
- Produces: workspaces `@veyro/control-plane`, `@veyro/market-worker`, `@veyro/telegram-worker`, and `@veyro/campaign-worker`.

- [ ] **Step 1: Write an entrypoint contract test**

```ts
test('every deployable declares a start command',async()=>{
 for(const name of ['control-plane','market-worker','telegram-worker','campaign-worker']){
  const json=JSON.parse(await readFile(`apps/${name}/package.json`,'utf8'));
  assert.equal(typeof json.scripts.start,'string',name);
 }
});
```

- [ ] **Step 2: Run it and verify missing applications fail**

Run: `pnpm --filter @veyro/bot exec tsx --test tests/workspace-entrypoints.test.mts`

Expected: FAIL reading `apps/control-plane/package.json`.

- [ ] **Step 3: Move the applications**

Give the control plane `dev`, `build`, `start`, and `typecheck` scripts and depend on `@veyro/bot: workspace:*`. Give the market worker `start: "node --import tsx src/main.ts"`. Give the two future workers startable entry points that log `worker disabled: implementation plan not yet applied` and exit with code 0; they must not poll or mutate state before their feature plans land.

- [ ] **Step 4: Run all package checks**

Run: `pnpm typecheck && pnpm test && pnpm build`

Expected: PASS; the Next routes are unchanged and all four application manifests satisfy the entrypoint test.

- [ ] **Step 5: Commit**

```bash
git add apps packages/bot worker app next.config.ts next-env.d.ts
git commit -m "refactor: isolate bot applications"
```

### Task 4: Make the workspace deployable from one Dockerfile

**Files:**
- Modify: `Dockerfile`
- Modify: `entrypoint.sh`
- Modify: `railway.json`
- Create: `docs/operations/workspace-services.md`
- Test: `packages/bot/tests/docker-contract.test.mts`

**Interfaces:**
- Consumes: `SERVICE=control-plane|market-worker|telegram-worker|campaign-worker`.
- Produces: one image whose entrypoint executes `pnpm --filter @veyro/$SERVICE start` as the `node` user.

- [ ] **Step 1: Write the Docker contract test**

```ts
test('container selects an allow-listed workspace service',async()=>{
 const entry=await readFile('entrypoint.sh','utf8');
 assert.match(entry,/control-plane\|market-worker\|telegram-worker\|campaign-worker/);
 assert.match(entry,/exec su node/);
 const docker=await readFile('Dockerfile','utf8');
 assert.match(docker,/pnpm-lock\.yaml/);
 assert.match(docker,/pnpm install --frozen-lockfile/);
});
```

- [ ] **Step 2: Run it and verify the old container fails**

Run: `pnpm --filter @veyro/bot exec tsx --test tests/docker-contract.test.mts`

Expected: FAIL because the current Dockerfile uses npm and `entrypoint.sh` always launches `server.js`.

- [ ] **Step 3: Implement service selection**

Use a Node 22 base image, activate the pinned pnpm through Corepack, copy workspace manifests before source files for caching, run `pnpm install --frozen-lockfile`, then `pnpm build`. In `entrypoint.sh`, use a `case "$SERVICE"` allow-list and default to `control-plane`; reject any other value with exit 64. Document each Railway service's `SERVICE` value and health behavior.

- [ ] **Step 4: Verify host and container builds**

Run: `pnpm typecheck && pnpm test && pnpm build`

Run: `docker build -t veyro-bot-workspace .`

Run: `docker run --rm -e SERVICE=bogus veyro-bot-workspace`

Expected: repository checks and image build PASS; invalid service exits 64 without executing a shell fragment.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile entrypoint.sh railway.json docs/operations/workspace-services.md packages/bot/tests/docker-contract.test.mts
git commit -m "build: package bot services for Railway"
```

### Task 5: Prove migration parity before feature work

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `docs/operations/workspace-migration-checklist.md`

**Interfaces:**
- Consumes: root pnpm commands and Docker image.
- Produces: a required CI sequence and recorded parity evidence.

- [ ] **Step 1: Make CI fail on npm-specific configuration**

Change CI to install Node 22, run `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Add a checklist assertion that `git grep -n 'npm ci\|package-lock.json' -- .github Dockerfile package.json` returns no matches.

- [ ] **Step 2: Run the old/new command scan**

Run: `git grep -n 'npm ci\|package-lock.json' -- .github Dockerfile package.json || true`

Expected before the CI edit: at least one legacy match.

- [ ] **Step 3: Record the parity checklist**

The checklist must record: test count before/after, route list before/after, database migration hashes unchanged, `VEYRO_TRADING_ENABLED` default unchanged, control-plane health response, market worker startup, and Docker non-root UID.

- [ ] **Step 4: Execute the full gate**

Run: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build`

Run: `git diff --exit-code -- supabase/migrations`

Expected: all checks PASS and existing migrations are byte-for-byte unchanged.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml docs/operations/workspace-migration-checklist.md
git commit -m "ci: verify bot workspace parity"
```
