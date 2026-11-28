import AxeBuilder from '@axe-core/playwright';
import {expect, type Page} from '@playwright/test';
import {AXE_TAGS, E2E, VIEWPORTS} from './e2e-config';

/** Fails the test on any WCAG 2.2 A/AA violation, listing each rule and where it hit. */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  // @axe-core/playwright types its Page from its own playwright-core copy; the object is the same.
  const axePage = page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'];
  const results = await new AxeBuilder({page: axePage}).withTags(AXE_TAGS).analyze();
  const summary = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id} (${violation.impact}): ${node.target.join(' ')} — ${describeNode(node)}`),
  );
  expect(summary, 'axe WCAG 2.2 A/AA violations').toEqual([]);
}

type AxeNode = {html: string; any: {data?: unknown}[]};

/** The colours and ratio for a contrast failure, else the start of the element's HTML. */
function describeNode(node: AxeNode): string {
  const data = node.any[0]?.data as {fgColor?: string; bgColor?: string; contrastRatio?: number; expectedContrastRatio?: string} | undefined;
  if (data?.fgColor) {
    return `${data.fgColor} on ${data.bgColor}: ${data.contrastRatio} (needs ${data.expectedContrastRatio}) ${node.html.slice(0, 80)}`;
  }
  return node.html.slice(0, 120);
}

/** Saves full-page screenshots of the current URL at 360, 768 and 1280 px wide. */
export async function captureAtAllWidths(page: Page, name: string): Promise<void> {
  const original = page.viewportSize();
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({width: viewport.width, height: viewport.height});
    await page.waitForLoadState('networkidle');
    await page.screenshot({path: `${E2E.screenshotsDir}/${name}-${viewport.width}.png`, fullPage: true});
  }
  if (original) {
    await page.setViewportSize(original);
  }
}

/** No horizontal page scroll at the current width (spec §11 Responsive). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(1);
}
