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
});
