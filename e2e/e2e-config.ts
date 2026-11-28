/** Shared settings for the e2e run; scripts/e2e.sh sets the same environment variables. */
export const E2E = {
  baseUrl: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
  uiPassword: process.env.UI_PASSWORD ?? '',
  basicAuthUser: 'e2e',
  artifactsDir: 'e2e-artifacts',
  screenshotsDir: 'e2e-artifacts/screenshots',
} as const;

/** The widths every primary screen is captured at (spec §11 Responsive). */
export const VIEWPORTS = [
  {name: 'mobile', width: 360, height: 780},
  {name: 'tablet', width: 768, height: 1024},
  {name: 'desktop', width: 1280, height: 900},
] as const;

/** WCAG 2.2 A and AA rules (spec §11 Accessibility). */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
