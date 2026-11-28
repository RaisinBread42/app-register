# Design tokens — Obsidian theme inventory

There is one visual system: the Obsidian Astryx theme. It is edited with the theme editor in `themes/obsidian/` (`obsidian.settings.json` holds the source values) and compiled into `src/themes/obsidian/`. Components take tokens through props and `var(--…)`; never use raw hex or px in `src/app` (CLAUDE.md).

## Brand

| Token / setting | Light value | Used for |
| --- | --- | --- |
| `--color-accent`, `--color-text-accent` | `#612CCC` (brand purple) | Primary actions, selected tab, links. Use sparingly |
| `--color-accent-muted` | `#F0E9FC` | Accent backgrounds |
| Side nav `background-color` | `#130F1C` (dark plum) | The brand shell. Data surfaces stay light |
| `--color-background-body` / `-surface` / `-card` | `#F8F9FC` / `#FFFFFF` / `#FFFFFF` | Low-noise surfaces |
| `--color-text-primary` / `-secondary` | `#1E1830` / `#6E697E` | Body text |
| `--color-border` | `#E7E4EE` | Subtle borders |

## Type

| Token | Value |
| --- | --- |
| `--font-family-heading` | Poppins (`next/font/google`, variable `--font-poppins`), then Inter, then sans-serif |
| `--font-family-body` | Inter (`--font-inter`), then system-ui, then sans-serif |
| `text-size` dial | 13 |
| `--text-heading-1-size` / `-2` / `-3` | 1.8125rem / 1.0625rem / 0.875rem |

**Licensing:** Poppins and Inter are both published under the SIL Open Font License 1.1, which allows use, bundling and embedding (including in PDFs); the licence text travels with the font files, and the fonts themselves may not be sold on their own. They are loaded through `next/font`, which self-hosts the files at build time. If a font fails to load, the stacks above fall back to Inter or the system sans-serif.

## Spacing, radius, size

- Spacing follows the Astryx 4 px scale: `--spacing-1` is 0.25rem, through `--spacing-12` at 3rem, plus `--spacing-0-5` and `--spacing-1-5`. Component props take the step number (`gap={4}` is `--spacing-4`).
- Radius: `--radius-container` 0.8125rem, `--radius-element` 0.5625rem, `--radius-inner` 0.4375rem.
- `--size-element-md` is 2.3125rem, the height of buttons and inputs. Side-nav items have a minimum height of 44px, a comfortable target size.

## Status (semantic)

| Meaning | Text / icon | Muted background |
| --- | --- | --- |
| Success / healthy | `--color-success`, `--color-text-success` `#167C4B` | `--color-success-muted` `#E4F5EB` |
| Warning / attention | `--color-text-warning` `#9D5E08` | `--color-warning-muted` `#FFF0D7` |
| Danger / critical | `--color-error`, `--color-text-error` `#C43045` | `--color-error-muted` `#FCE7EB` |
| Info | `--color-info`, `--color-text-info` `#285CB7` | `--color-info-muted` `#E8F0FF` |

Every status is shown with a word as well as a colour (spec §6). Contrast is checked by a test in [30].

## Modes

Light only: `mode="light"` in `src/app/providers.tsx`. The theme generates dark values, but they are not designed yet; that is #24.

## Accessibility baseline ([30])

- Colours, spacing and type in UI code come from theme tokens: `src/app/ui-boundaries.test.ts` fails on raw hex, `px`, `rgb()`/`hsl()` in `src/app` and `src/lib/ui`, and on any of them in `globals.css`. Numeric size props on Astryx components (`width={520}`) are the components' own API and stay allowed.
- `src/lib/ui/theme-contrast.test.ts` checks WCAG AA (4.5:1) for the theme's text and status tokens on their surfaces; axe checks the contrast of what every screen renders, at 1280 and 360 px.
- Status never shows by colour alone: badges carry a word (severity, status), scores sit next to a verdict.
- Motion: Astryx components honour `prefers-reduced-motion` themselves (dialogs and drawers stop sliding, spinners slow down instead of freezing), so the app adds no global rule.
- The side nav's keyboard focus ring is `#AA9BFC` on the dark shell (set with the theme editor), above the 3:1 WCAG 2.2 asks for.
- Known: the resting text-input border (`#DFDCE8`, 1.35:1) is the Astryx default; every field has a label (visible, or read by screen readers for the compact list filters).

