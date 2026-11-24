# App Register mockups

Throwaway Astryx screens on branch `mockups/05-leaver-checklist` (built on the approved [03] Obsidian mockups). **Not** product implementation.

## Theme

Obsidian Software brand via custom Astryx theme `obsidian` (primary `#612CCC`, dark sidebar `#130F1C`, Poppins headings / Inter body).

## Screens

| Route | Purpose |
| --- | --- |
| `/mockups/overview` | Dashboard: average health, at-risk apps, critical notices |
| `/mockups/list` | Apps list: health score, licence column, category checks |
| `/mockups/edit?id=` | App detail: score breakdown + Overview / Deps / Hosting / Notices / Sources |
| `/mockups/notices` | Cross-app notices feed with filters |
| `/mockups/sources` | Watched sources + Add source |
| `/mockups/leaver` | **[05]** Pick who is leaving |
| `/mockups/leaver/checklist` | **[05]** Apps they own or back up + reassign (both roles filled) |
| `/mockups/leaver/done` | **[05]** Empty “all reassigned” state |
| `/mockups/settings` | Placeholder |
| `/mockups/create` | Add app (still available) |

## Capture

```bash
# with `npm run dev` on :3000 and next.config `devIndicators: false`
node scripts/capture-mockups.mjs
```

PNGs for [05] land in `docs/mockups/05-leaver-checklist/` (committed) and are also copied to `/opt/cursor/artifacts/`.

## Seed

Fictional tenant **Meridian Labs** only. Leaver demo person: Priya Chen (owner of Sentinel Access + Nimbus Mail; backup on Atlas Board).
