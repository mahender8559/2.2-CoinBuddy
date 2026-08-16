import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Keep browser/storage pressure bounded during the full desktop + mobile run.
  // Uncapped local runs auto-selected 6 workers on Windows and occasionally
  // exhausted the loopback socket/buffer pool (net::ERR_NO_BUFFER_SPACE).
  // Three workers keeps useful parallelism without turning infrastructure
  // pressure into false application failures. CI is intentionally tighter.
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Exercise the generated service worker and its production precache.
    command: 'npm run build && npm run preview -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
