import { defineConfig, devices } from '@playwright/test';

// Tests run against the production build in dist/, served like GitHub Pages by
// scripts/serve-dist.mjs. Run `pnpm build` first (pnpm verify does).
// Set E2E_BASE_URL to test an already-running server instead, for example a
// sub-path deployment.
const PORT = 4323;
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: external ?? `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  ...(external
    ? {}
    : {
        webServer: {
          command: `node scripts/serve-dist.mjs --port ${PORT}`,
          url: `http://localhost:${PORT}/`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      }),
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
