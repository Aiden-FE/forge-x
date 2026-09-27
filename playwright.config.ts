import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5175/forge-x/',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        channel: 'chrome',
      },
    },
    {
      name: 'webkit',
      use: {
        browserName: 'webkit',
      },
    },
  ],
  webServer: {
    command: 'pnpm dev --port 5175 --strictPort',
    url: 'http://localhost:5175/forge-x/',
    reuseExistingServer: !process.env.CI && process.env.REUSE_EXISTING_VITE === 'true',
    timeout: 30000,
  },
})
