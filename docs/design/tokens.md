# Design tokens — Obsidian theme inventory

There is one visual system: the Obsidian Astryx theme. It is edited with the theme editor in `themes/obsidian/` (`obsidian.settings.json` holds the source values) and compiled into `src/themes/obsidian/`. Components take tokens through props and `var(--…)`; never use raw hex or px in `src/app` (CLAUDE.md).

## Brand

| Token / setting | Light value | Used for |
| --- | --- | --- |
| `--color-accent`, `--color-text-accent` | `#612CCC` (brand purple) | Primary actions, selected tab, links. Use sparingly |
| `--color-accent-muted` | `#F0E9FC` | Accent backgrounds |
| Side nav `background-color` | `#130F1C` (dark plum) | The brand shell. Data surfaces stay light |
| `--color-background-body` / `-surface` / `-card` | `#F8F9FC` / `#FFFFFF` / `#FFFFFF` | Low-noise surfaces |
| `--color-text-primary` / `-secondary` | `#1E1830` / `#767087` | Body text |
| `--color-border` | `#E7E4EE` | Subtle borders |

## Type

| Token | Value |
| --- | --- |
| `--font-family-heading` | Poppins (`next/font/google`, variable `--font-poppins`), then Inter, then sans-serif |
| `--font-family-body` | Inter (`--font-inter`), then system-ui, then sans-serif |
| `text-size` dial | 13 |
| `--text-heading-1-size` / `-2` / `-3` | 1.8125rem / 1.0625rem / 0.875rem |

**Licensing:** Poppins and Inter are both published under the SIL Open Font License 1.1, which allows use, bundling and embedding (including in PDFs) with attribution. They are loaded through `next/font`, which self-hosts the files at build time. If a font fails to load, the stacks above fall back to Inter or the system sans-serif.

## Spacing, radius, size

- Spacing follows the Astryx 4 px scale: `--spacing-1` is 0.25rem, through `--spacing-12` at 3rem, plus `--spacing-0-5` and `--spacing-1-5`. Component props take the step number (`gap={4}` is `--spacing-4`).
- Radius: `--radius-container` 0.8125rem, `--radius-element` 0.5625rem, `--radius-inner` 0.4375rem.
- `--size-element-md` is 2.3125rem, the height of buttons and inputs. Side-nav items have a minimum height of 44px, a comfortable target size.

## Status (semantic)

| Meaning | Text / icon | Muted background |
| --- | --- | --- |
| Success / healthy | `--color-success`, `--color-text-success` `#18834F` | `--color-success-muted` `#E4F5EB` |
| Warning / attention | `--color-text-warning` `#A86409` | `--color-warning-muted` `#FFF0D7` |
| Danger / critical | `--color-error`, `--color-text-error` `#C93147` | `--color-error-muted` `#FCE7EB` |
| Info | `--color-info`, `--color-text-info` `#285CB7` | `--color-info-muted` `#E8F0FF` |

Every status is shown with a word as well as a colour (spec §6). Contrast is checked by a test in [30].

## Modes

Light only: `mode="light"` in `src/app/providers.tsx`. The theme generates dark values, but they are not designed yet; that is #24.
