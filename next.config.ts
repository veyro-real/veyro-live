import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // @veyro/bot ships TypeScript sources, not a dist build.
  transpilePackages: ["@veyro/bot"],
};
export default config;
