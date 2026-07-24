import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Expose ALCHEMY_API_KEY to the client bundle (Scaffold-ETH wagmi RPC).
  // Alchemy keys used this way are public-by-design for frontend RPC access.
  env: {
    ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY ?? "",
  },
  // Avoid bundling optional lazy @x402/* imports from @coinbase/cdp-sdk (RainbowKit baseAccount).
  serverExternalPackages: ["@coinbase/cdp-sdk"],
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
};

const isIpfs = process.env.NEXT_PUBLIC_IPFS_BUILD === "true";

if (isIpfs) {
  nextConfig.output = "export";
  nextConfig.trailingSlash = true;
  nextConfig.images = {
    unoptimized: true,
  };
}

module.exports = nextConfig;
