import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// In a pnpm workspace the files the server needs (packages/bot, vendor/*) sit
// above this app, and pnpm links them as symlinks. Without an explicit root,
// Next traces from this directory and the standalone bundle comes up short.
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingRoot: workspaceRoot,
  // @veyro/bot ships TypeScript sources, not a dist build.
  transpilePackages: ["@veyro/bot"],
};
export default config;
