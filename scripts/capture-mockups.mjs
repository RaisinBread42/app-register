import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';

mkdirSync('/opt/cursor/artifacts', {recursive: true});

const shots = [
  {
    path: '/opt/cursor/artifacts/v2-01-overview.png',
    url: 'http://localhost:3000/mockups/overview',
  },
  {
    path: '/opt/cursor/artifacts/v2-02-apps-list.png',
    url: 'http://localhost:3000/mockups/list',
  },
  {
    path: '/opt/cursor/artifacts/v2-03-app-detail.png',
    url: 'http://localhost:3000/mockups/edit?id=a5',
  },
  {
    path: '/opt/cursor/artifacts/v2-04-notices.png',
    url: 'http://localhost:3000/mockups/notices',
  },
  {
    path: '/opt/cursor/artifacts/v2-05-sources.png',
    url: 'http://localhost:3000/mockups/sources',
  },
  {
    path: '/opt/cursor/artifacts/v2-06-app-deps.png',
    url: 'http://localhost:3000/mockups/edit?id=a4',
    after: async (page) => {
      await page.getByRole('tab', {name: 'Dependencies'}).click();
      await page.waitForTimeout(400);
    },
  },
  {
    path: '/opt/cursor/artifacts/v2-07-app-hosting.png',
    url: 'http://localhost:3000/mockups/edit?id=a5',
    after: async (page) => {
      await page.getByRole('tab', {name: 'Hosting'}).click();
      await page.waitForTimeout(400);
    },
  },
];

const browser = await chromium.launch({headless: true});
const page = await browser.newPage({
  viewport: {width: 1440, height: 900},
  deviceScaleFactor: 1,
});

for (const shot of shots) {
  console.log('capturing', shot.url);
  await page.goto(shot.url, {waitUntil: 'networkidle', timeout: 60000});
  // Belt-and-braces: hide Next.js / turbopack floating widgets if any slip through
  await page.addStyleTag({
    content: `
      [data-nextjs-toast],
      [data-next-badge-root],
      nextjs-portal,
      #__next-build-watcher,
      [aria-label="Open Next.js Dev Tools"] {
        display: none !important;
        visibility: hidden !important;
      }
    `,
  });
  await page.waitForTimeout(900);
  if (shot.after) await shot.after(page);
  await page.screenshot({path: shot.path, fullPage: false});
  console.log('wrote', shot.path);
}

await browser.close();
console.log('done');
