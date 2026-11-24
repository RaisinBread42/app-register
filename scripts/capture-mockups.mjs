import {chromium} from 'playwright';
import {mkdirSync, copyFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

const repoShots = join(
  process.cwd(),
  'docs/mockups/05-leaver-checklist',
);
mkdirSync(repoShots, {recursive: true});
mkdirSync('/opt/cursor/artifacts', {recursive: true});

const shots = [
  {
    file: '01-pick-person.png',
    url: 'http://localhost:3000/mockups/leaver',
    description: 'Pick who is leaving',
  },
  {
    file: '02-checklist-reassign.png',
    url: 'http://localhost:3000/mockups/leaver/checklist',
    description: 'Owned/backup apps with reassign controls',
  },
  {
    file: '03-all-reassigned.png',
    url: 'http://localhost:3000/mockups/leaver/done',
    description: 'Empty all-reassigned state',
  },
];

const browser = await chromium.launch({headless: true});
const page = await browser.newPage({
  viewport: {width: 1440, height: 900},
  deviceScaleFactor: 1,
});

for (const shot of shots) {
  const dest = join(repoShots, shot.file);
  console.log('capturing', shot.url, '→', dest);
  await page.goto(shot.url, {waitUntil: 'networkidle', timeout: 60000});
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
  mkdirSync(dirname(dest), {recursive: true});
  await page.screenshot({path: dest, fullPage: false});
  copyFileSync(dest, join('/opt/cursor/artifacts', `05-leaver-${shot.file}`));
  console.log('wrote', dest, `(${shot.description})`);
}

await browser.close();
console.log('done');
