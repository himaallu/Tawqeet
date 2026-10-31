import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env: rely on the environment
}
const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5455/tawqeet";
const testUrl = base.replace(/\/([^/?]+)(\?|$)/, "/tawqeet_test$2");
// globalSetup runs in this process and doesn't see test.env.
process.env.ADMIN_DATABASE_URL = base;
process.env.TEST_DB_URL = testUrl;

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: testUrl,
      ADMIN_DATABASE_URL: base,
      NODE_ENV: "test",
      AI_OFFLINE: "1",
      RESEND_API_KEY: "",
      LEADOCEAN_API_KEY: "",
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      INBOUND_DOMAIN: "in.tawqeet.test",
      INBOUND_WEBHOOK_SECRET: "inbound-secret",
      APP_URL: "http://localhost:5000",
    },
  },
});
