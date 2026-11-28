import {defineConfig, devices} from '@playwright/test';
import {E2E} from './e2e/e2e-config';

/**
 * End-to-end journeys, accessibility (axe) and screenshots against a running
 * build with seeded demo data. Start it with `npm run e2e` (scripts/e2e.sh):
 * it migrates, seeds, builds, starts the app and then runs this.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: `${E2E.artifactsDir}/test-results`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  /** A committed test.only must fail CI instead of quietly running a subset. */
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['json', {outputFile: `${E2E.artifactsDir}/report.json`}]],
  use: {
    baseURL: E2E.baseUrl,
    httpCredentials: {username: E2E.basicAuthUser, password: E2E.uiPassword},
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
});
