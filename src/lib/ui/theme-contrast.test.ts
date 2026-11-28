import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * [30] The Obsidian theme's text and status colours meet WCAG AA (4.5:1 for text) on
 * the surfaces they sit on, in light and dark. Reads the built theme, so a change made
 * with the theme editor is checked too.
 */

const THEME_CSS = path.join(process.cwd(), 'src/themes/obsidian/obsidian.css');
const AA_TEXT = 4.5;

/** The theme's token block: the first `:scope { … }` in the astryx-theme layer. */
function themeTokens(): Map<string, string> {
  const css = readFileSync(THEME_CSS, 'utf8');
  const start = css.indexOf(':scope {', css.indexOf('@layer astryx-theme'));
  const block = css.slice(start, css.indexOf('}', start));
  const tokens = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    if (!tokens.has(name)) tokens.set(name, value.trim());
  }
  return tokens;
}

const TOKENS = themeTokens();

type Mode = 'light' | 'dark';

/** A token's colour in one mode, following var() and light-dark(); null for anything that is not an opaque hex colour. */
function colour(name: string, mode: Mode): string | null {
  const value = TOKENS.get(name);
  if (!value) return null;
  return resolve(value, mode);
}

function resolve(value: string, mode: Mode): string | null {
  const pair = value.match(/^light-dark\((.+)\)$/);
  if (pair) {
    const [light, dark] = splitTopLevel(pair[1]);
    return resolve(mode === 'light' ? light : dark, mode);
  }
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  if (reference) return colour(reference[1], mode);
  return /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(value) ? value : null;
}

/** Splits "a, b" at the comma that is not inside parentheses. */
function splitTopLevel(text: string): [string, string] {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    if (text[index] === ')') depth -= 1;
    if (text[index] === ',' && depth === 0) return [text.slice(0, index).trim(), text.slice(index + 1).trim()];
  }
  return [text.trim(), text.trim()];
}

function luminance(hex: string): number {
  const full = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : hex;
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255);
  const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Text tokens and the surfaces the app puts them on (status badges, banners, body text, buttons). */
const PAIRS: [string, string][] = [
  ...['--color-background-body', '--color-background-card', '--color-background-surface'].flatMap((surface): [string, string][] => [
    ['--color-text-primary', surface],
    ['--color-text-secondary', surface],
    ['--color-text-accent', surface],
  ]),
  ['--color-text-green', '--color-background-green'],
  ['--color-text-success', '--color-success-muted'],
  ['--color-text-yellow', '--color-background-yellow'],
  ['--color-text-warning', '--color-warning-muted'],
  ['--color-text-red', '--color-background-red'],
  ['--color-text-error', '--color-error-muted'],
  ['--color-text-info', '--color-info-muted'],
  ['--color-text-orange', '--color-background-orange'],
  ['--color-text-purple', '--color-background-purple'],
  ['--color-text-pink', '--color-background-pink'],
  ['--color-text-accent', '--color-accent-muted'],
  ['--color-on-accent', '--color-accent'],
  ['--color-on-success', '--color-success'],
  ['--color-on-error', '--color-error'],
  ['--color-on-info', '--color-info'],
  ['--color-on-warning', '--color-warning'],
];

describe('theme contrast', () => {
  it('reads the theme tokens it checks', () => {
    for (const [text, surface] of PAIRS) {
      expect(colour(text, 'light'), text).not.toBeNull();
      expect(colour(surface, 'light'), surface).not.toBeNull();
    }
  });

  for (const mode of ['light', 'dark'] as const) {
    it(`AC2: every text and status colour meets WCAG AA (${AA_TEXT}:1) on its surface in ${mode} mode`, () => {
      const failures = PAIRS.flatMap(([text, surface]) => {
        const [foreground, background] = [colour(text, mode), colour(surface, mode)];
        if (!foreground || !background) return [];
        const ratio = contrast(foreground, background);
        return ratio < AA_TEXT ? [`${text} ${foreground} on ${surface} ${background}: ${ratio.toFixed(2)}`] : [];
      });
      expect(failures).toEqual([]);
    });
  }
});
