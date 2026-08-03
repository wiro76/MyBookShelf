import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    useTypeScriptCli: true,
  },
  // TypeScript 7 is validated by the dedicated `npm run typecheck` command.
  // Next 16 cannot resolve the official TS6/TS7 side-by-side package layout during build.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
