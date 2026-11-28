import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {ENV} from '@/lib/constants';

/** Static checks over the UI source: what ships to the browser, and what it is built from. */

const ROOT = path.resolve(__dirname, '..');
const ENV_EXAMPLE = path.resolve(ROOT, '..', ['.env', 'example'].join('.'));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, {withFileTypes: true, recursive: true})
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

const files = sourceFiles(ROOT).map((file) => ({file: path.relative(ROOT, file), text: readFileSync(file, 'utf8')}));
const isClient = (text: string) => /^['"]use client['"]/.test(text.trimStart());
const uiFiles = files.filter(({file}) => file.endsWith('.tsx') && file.startsWith('app'));

describe('UI boundaries', () => {
  it('the API key never reaches the browser: no client module imports the API client or reads env, and nothing is NEXT_PUBLIC', () => {
    const clientFiles = files.filter(({text}) => isClient(text));
    expect(clientFiles.length).toBeGreaterThan(0);
    for (const {file, text} of clientFiles) {
      expect(text, file).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+['"]@\/lib\/ui\/api-client['"]/m);
      expect(text, file).not.toMatch(/process\.env/);
    }
    for (const {file, text} of files) {
      expect(text, file).not.toContain('NEXT_PUBLIC_');
    }
    const example = readFileSync(ENV_EXAMPLE, 'utf8');
    expect(example).toContain(`${ENV.apiKey}=`);
    expect(example).not.toContain('NEXT_PUBLIC_');
  });

  it('AC4: every UI screen is built from Astryx components, with no raw HTML elements', () => {
    expect(uiFiles.length).toBeGreaterThan(5);
    for (const {file, text} of uiFiles) {
      expect(text, file).not.toMatch(/<(div|span|button|input|select|textarea|form|table|a|p|ul|li|label|h[1-6])[\s>]/);
      const componentImports = [...text.matchAll(/^import\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/gm)]
        .map((match) => match[1])
        .filter((source) => !source.startsWith('@/') && !source.startsWith('.') && !source.startsWith('next/') && source !== 'react');
      for (const source of componentImports) {
        expect(source, file).toMatch(/^@astryxdesign\/core\//);
      }
    }
  });

  it('Sources and People moved under Settings: their old routes only redirect there (spec §4, ADR 0003)', () => {
    for (const [folder, section] of [['sources', 'sources'], ['people', 'people']]) {
      const screens = uiFiles.filter(({file}) => file.startsWith(path.join('app', '(register)', folder) + path.sep));
      expect(screens.map(({file}) => path.basename(file)), folder).toEqual(['page.tsx']);
      expect(screens[0].text, folder).toMatch(new RegExp(`redirect\\(settingsRoute\\(SETTINGS_SECTION\\.${section}\\)\\)`));
    }
  });

  it('Settings loads each section through the API client on the server and its client sections only call server actions', () => {
    const settings = uiFiles.filter(({file}) => file.startsWith(path.join('app', '(register)', 'settings') + path.sep));
    const page = settings.find(({file}) => path.basename(file) === 'page.tsx');
    expect(page?.text).toMatch(/apiClient/);
    expect(page?.text).not.toMatch(/^['"]use client['"]/);
    const clientViews = settings.filter(({file}) => path.basename(file) !== 'page.tsx');
    for (const {file, text} of clientViews) {
      expect(text, file).toMatch(/^['"]use client['"]/);
      expect(text, file).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+['"]@\/lib\/ui\/api-client['"]/m);
    }
    for (const name of ['ApiKeysSection.tsx', 'PeopleSection.tsx']) {
      expect(settings.find(({file}) => path.basename(file) === name)?.text, name).toMatch(/from ['"]\.\.\/actions['"]/);
    }
  });

  it('Notices is a primary destination: the sidebar links to it and its route renders a screen, not a redirect', () => {
    const shell = uiFiles.find(({file}) => file.endsWith('RegisterShell.tsx'));
    expect(shell?.text).toMatch(/ROUTES\.notices/);
    const page = uiFiles.find(({file}) => file === path.join('app', '(register)', 'notices', 'page.tsx'));
    expect(page?.text).not.toMatch(/redirect\(/);
  });

  it("the app stays in light mode even when the reader's system is in dark mode", () => {
    const providers = files.find(({file}) => file === path.join('app', 'providers.tsx'));
    expect(providers?.text).toMatch(/<Theme[^>]*\bmode="light"/);
  });
});
