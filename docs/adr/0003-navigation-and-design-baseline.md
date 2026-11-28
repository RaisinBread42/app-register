# ADR 0003 — Navigation and design baseline for spec v1.0

**Status:** Accepted · **Date:** 2026-11-28 · **Context:** [spec-v1.md](../product/spec-v1.md) §4 and §7, [governance-board.md](../product/governance-board.md)

## Decision

1. **Primary navigation:** Overview, Applications, Notices, Governance. Settings sits in the bottom section of the side nav.
   - The spec names four primary destinations: Overview, Applications, Notices and Settings.
   - Governance is the owner's later addition. It is a reading view for managers and executives, so it sits beside the other primary views rather than inside Settings.
2. **Sources** becomes Settings › Monitoring sources (spec §4). The Sources screen's layout (a summary, search and a status filter over a table of sources) moves there and now shows the real sources list from #36, and `/sources` redirects to it. Its placeholder parts ("—" metrics and a disabled "Connect source" button) are not carried over, because no source can be connected yet and the spec forbids implying coverage that doesn't exist (§10 item 32). The Round 2 mockups' Sources screen on its branch stays as the reference for when connecting a source becomes possible.
3. **People** becomes Settings › People, and `/people` redirects to it. People are owners, so they belong with workspace data management. The spec's four primary items have no room for them.
4. **Design baseline:** the prototype on `main` (`docs/design/app-register-prototype.html`), which PR #22 built as "the agreed prototype". The Round 2 mockups on branch `mockups/03-app-list` (commit fa97270) were never approved. They are used only as a reference for the Notices and Sources layouts, which the prototype also covers.
5. **Tokens:** the Obsidian Astryx theme stays the only visual system. shadcn/ui is not adopted: CLAUDE.md requires Astryx, and the spec allows shadcn only when it is compatible (§7, §10 item 29). The inventory is in [docs/design/tokens.md](../design/tokens.md).

## Tradeoffs

- **Governance as a fifth item.** It adds an entry to the navigation the spec kept to four. We accept that, because hiding a reading view for executives inside Settings would bury it.
- **Moving People under Settings.** People takes one extra click. The leaver flow (#8) will link straight to it from Governance accountability gaps.
