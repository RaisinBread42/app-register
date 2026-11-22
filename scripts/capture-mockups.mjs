import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';

mkdirSync('/opt/cursor/artifacts', {recursive: true});

const shots = [
  {path: '/opt/cursor/artifacts/01-list.png', url: 'http://localhost:3000/mockups/list'},
  {path: '/opt/cursor/artifacts/02-create.png', url: 'http://localhost:3000/mockups/create'},
  {path: '/opt/cursor/artifacts/03-edit.png', url: 'http://localhost:3000/mockups/edit?id=a1'},
  {path: '/opt/cursor/artifacts/04-empty.png', url: 'http://localhost:3000/mockups/empty'},
  {path: '/opt/cursor/artifacts/05-edit-inhouse.png', url: 'http://localhost:3000/mockups/edit?id=a3'},
];

const browser = await chromium.launch({headless: true});
const page = await browser.newPage({
  viewport: {width: 1440, height: 900},
  deviceScaleFactor: 1,
});

for (const shot of shots) {
  console.log('capturing', shot.url);
  await page.goto(shot.url, {waitUntil: 'networkidle', timeout: 60000});
  // Let Astryx theme/fonts settle
  await page.waitForTimeout(800);
  await page.screenshot({path: shot.path, fullPage: false});
  console.log('wrote', shot.path);
}

await browser.close();
console.log('done');
