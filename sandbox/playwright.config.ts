import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the sandbox. The webServer runs the Vite dev server
 * (all AWS calls are mocked, so no network/credentials are needed) and the
 * tests drive the hash-router app at http://localhost:5173/#/<route>.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // Dedicated, uncommon port + strictPort so tests never collide with (or
    // silently reuse) another dev server running on Vite's default 5173.
    baseURL: 'http://localhost:4317',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 4317 --strictPort',
    url: 'http://localhost:4317',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
