import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the real stack: Rust API + production Next.js build.
//
//   npm run test:e2e            (builds the web app, starts API + web, runs tests)
//
// Needs PostgreSQL with the migrations applied (`docker compose up db`), reachable
// via DATABASE_URL. Set E2E_BASE_URL to test an already running deployment instead.

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const API_PORT = Number(process.env.E2E_API_PORT ?? 8080);
// localhost (not 127.0.0.1): browsers treat it as a secure context, so the Secure auth cookies work over http
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`;

const touch = { isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone-360", use: { ...devices["Pixel 5"], ...touch, viewport: { width: 360, height: 740 } } },
    { name: "phone-390", use: { ...devices["iPhone 13"], ...touch, browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "tablet-768", use: { ...touch, viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1280", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "cargo run --release --bin api",
          cwd: "../api",
          url: `http://127.0.0.1:${API_PORT}/auth/me`,
          reuseExistingServer: !process.env.CI,
          timeout: 600_000,
          env: {
            DATABASE_URL: process.env.DATABASE_URL ?? "postgres://homegame:homegame@localhost:5432/homegame",
            JWT_SECRET: process.env.JWT_SECRET ?? "e2e-secret",
            PORT: String(API_PORT),
            SQLX_OFFLINE: "true",
          },
        },
        {
          command: `npx next start -p ${WEB_PORT}`,
          url: `http://127.0.0.1:${WEB_PORT}/login`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: { API_URL: `http://127.0.0.1:${API_PORT}`, NODE_ENV: "production" },
        },
      ],
});
