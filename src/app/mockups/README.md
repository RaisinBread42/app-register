# App Register mockups (v2)

Throwaway Astryx screens on branch `mockups/03-app-list` for Shannon. **Not** product implementation.

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
| `/mockups/settings` | Placeholder (Leavers / Quarterly review hidden) |
| `/mockups/create` | Add app (still available) |

## Capture

```bash
# with `npm run dev` on :3000 and next.config `devIndicators: false`
node --experimental-strip-types=false scripts/capture-mockups.mjs
# or: npx playwright test / run via node after `npm i -D playwright`
```

PNGs land in `/opt/cursor/artifacts/v2-01-…`.

## Scoring (demo)

Start at 100. Floor at 0.

- Dependencies: −10 critical CVE, −5 high, −2 medium; −3 major behind, −1 minor behind
- Licence: −15 notice ≤30d, −8 ≤60d, −4 ≤90d, −20 overdue
- Pricing: −5 announced increase
- Hosting: −12 EOS ≤90d, −25 past EOS, −8 regional outage, −3 pending platform update

Sort apps by score ascending (worst first).
