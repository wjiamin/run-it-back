// Browser tests for Run It Back. See the README ("Tests") for how to run them.
import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  fullyParallel: true,
  reporter: process.env.CI ? [['list'], ['html', {open: 'never'}]] : 'list',
  use: {
    baseURL: 'http://localhost:5174',
    serviceWorkers: 'block',   // always test the files as they are now, never an offline copy
    // a Chromium already on the machine can be used instead of Playwright's own (CHROMIUM_PATH=/path/to/chromium)
    launchOptions: {
      ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
      // Chromium's built-in pretend camera, for the 📷 Me tests
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: {command: 'node serve.mjs 5174', url: 'http://localhost:5174', reuseExistingServer: !process.env.CI},
});
