# Gap analysis — spec v1.0 against the code

**Date:** 2026-11-28 · **Baseline:** `main` at `7422425` · **Spec:** [spec-v1.md](spec-v1.md) plus the owner's [Governance Board](governance-board.md) addition · **Tracker:** GitHub issue #68

## 1. What already exists

| Area | Today | Where |
| --- | --- | --- |
| Inventory | One record per app: four kinds (`saas`, `in_house`, `citizen_built`, `vendor_service`), owner and backup owner, vendor, renewal date, notice deadline, cost, three in-house fields, soft archive | `src/lib/db/schema.ts`, `src/lib/services/apps.ts` |
| Health | 100 minus fixed deductions from two dimensions, dependencies and hosting; licence and pricing are not monitored | `src/lib/services/health.ts` |
| Dependencies | Import from `package.json` or a lockfile; latest versions from npm; advisories from OSV, stored as rows | `dependency-health.ts`, `dependency-advisories.ts` |
| Hosting | Catalog of providers and services; end-of-support dates from endoflife.date; public status feeds | `hosting-monitor.ts`, `src/lib/monitoring/` |
| Alerts | Rows scheduled 90, 60 and 30 days before the notice deadline. **No email is sent on main** (PR #33 open) | `notice-alerts.ts` |
| API | Bearer keys, `Idempotency-Key`, OpenAPI spec, replay from relational rows | `src/lib/api/` |
| UI | Overview, Applications, App detail, Sources (coming soon), Settings (static), People; Astryx with the Obsidian theme | `src/app/(register)/` |
| Ops | UAT on Azure Container Apps, deployed on every push to `main`; daily refresh job | `.github/workflows/deploy-uat.yml`, `infra/main.bicep` |
| Tests | 25 Vitest files, 222 tests, PGlite, network blocked | `vitest.config.ts`, `src/test-setup.ts` |

Open work found: PR #33 (alert email, sink only), PR #36 (Settings sources and scoped API keys), PR #37 (leaver mockups). The Round 2 mockups live only on branch `mockups/03-app-list`, with no PR.

## 2. Conflicts with the spec

1. **Navigation** (§4): there is no Notices page (it redirects to Overview), while Sources and People are primary nav items.
2. **Notices** (§3 P0): there is no Notice entity, status, history or match confidence. Findings are replaced on every check.
3. **Actions** (§3 P0): there is no review, assign, snooze or handled workflow, and no audit table.
4. **Score** (§8): no version and no coverage. A stale dependency source can still show green (breaks check 23). Provider-wide incidents lower the score.
5. **Overview** (§4.1, §7) leads with five metric cards and a distribution chart.
6. **Inventory** (Journey B): there is no criticality or environment field. The backup owner and in-house fields are mandatory.
7. **Security** (§9): no users, memberships or roles; one shared UI password.
8. **Verification** (§11): no E2E or accessibility tooling.
9. **Docs** (§10 item 32): positioning still reads "renewal and ownership register", and CLAUDE.md said SQLite.
10. **shadcn/ui**: not compatible, because CLAUDE.md requires Astryx only. The spec allows this ("only if compatible").

## 3. Decisions taken

The owner has delegated every decision. The spec is the source of truth.

| # | Decision |
| --- | --- |
| D1 | Each PR is merged by the agent once `gate.sh`, CI and a fresh-agent adversarial review all pass. Merging deploys to UAT, so migrations stay additive only. |
| D2 | PR #36 is merged first, then PR #33. |
| D3 | Design baseline: the prototype on `main` (`docs/design/app-register-prototype.html`). The Round 2 mockups are a reference for Notices and Sources only. See [ADR 0003](../adr/0003-navigation-and-design-baseline.md). |
| D4 | Playwright and axe-core are added as dev dependencies, for journeys and accessibility. |
| D5 | People moves under Settings. Primary nav: Overview, Applications, Notices, Governance; Settings at the bottom. |
| D6 | The backup owner and the in-house fields become optional. A missing backup owner shows as a setup item and as a Governance accountability gap. |
| D7 | Email stays in the sink until a provider and its credentials exist; Azure Communication Services is intended. |
| D8 | Sign-in uses individual accounts with Admin and Member roles. It starts with email and password (Node `scrypt`, no new library), and a first-run setup creates the first Admin. Magic link comes once email works. |
| D9 | Health score v2 sits behind a workspace setting that is off by default, with a scoring doc and a dry-run comparison. |
| D10 | Retention: audit events and score snapshots are kept indefinitely; alert deliveries for 2 years. |
| D11 | GitHub uses a fine-grained read-only token and Azure DevOps a read-only PAT. Both are encrypted at rest with a key from an environment variable. |
| D12 | Notice summaries are extractive only (quoted and linked); no LLM for now. |
| D13 | The Governance PDF uses a pure-JS PDF library in the Node container. |

## 4. Plan

Each issue is one PR, merged in this order. The issue numbers are on tracker #68.

1. **M0:** [19] docs · [20] verification harness and seed data
2. **M1:** PR #36 · [21] navigation · [22] inventory fields · [25] notices domain · [26] actions and audit · [27] Notices inbox · [28] Overview · [29] app detail · [23] catalog · [24] add app and archive · [30] visual and accessibility baseline
3. **M2:** [31] source freshness · [32] score v2 · [33] score snapshots · [34] contracts and deadlines · PR #33 then [35] alert delivery · [36] licensing and pricing notices · [37] sign-in and roles
4. **Governance:** [49] board · [50] history · [51] PDF
5. **M3:** [38] first run · [39] CSV · [40] weekly digest · [41] export, retention and deletion
6. **P1 and P2:** [42] GitHub · [43] Azure DevOps · [44] relationships · [45] score history · [46] summaries
7. **M4:** [47] release gates · [48] usability review, which people run, not an agent

## 5. Out of scope (spec §3 "Avoid", and the owner's governance limit)

Incident command, universal cloud auto-discovery, ticketing, procurement, endpoint monitoring, automated remediation, MSP billing, and a full GRC or compliance platform.
