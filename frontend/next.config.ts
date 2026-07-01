import type { NextConfig } from "next";

// Browser → Casper node RPC is proxied through the Next.js server to dodge CORS:
// the public testnet node returns no `access-control-*` headers, so a direct
// browser POST is blocked ("Network Error"). The client posts to the same-origin
// `/casper-rpc` and Next forwards it server-side (server→node has no CORS). Reads
// still go through the backend; this proxy is only for user-signed submits/confirms.
const CASPER_RPC_UPSTREAM =
  process.env.CASPER_RPC_UPSTREAM ?? "https://node.testnet.casper.network/rpc";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/casper-rpc", destination: CASPER_RPC_UPSTREAM }];
  },
};

export default nextConfig;
