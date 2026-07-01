import { defineConfig } from "vitest/config";

// Unit tests cover the client's only numeric code (lib/format.ts — BigInt
// fixed-point formatting). Pure functions, so a Node environment is enough; no
// jsdom/React runtime needed here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
