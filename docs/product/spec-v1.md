<!-- Converted from App_Register_Product_UX_Engineering_Spec.docx (v1.0, 28 Nov 2026). The owner treats this as the source of truth. Owner additions: governance-board.md. Decisions taken: gap-analysis.md. -->

# Product positioning, UX design system & Claude Code implementation specification

Version 1.0 \| 28 November 2026 \| Owner: Obsidian Software

Guiding promise: Open → Understand → Act → Done.

# Implementation directive

Use this as the product and experience contract for RaisinBread42/app-register. First inspect the repository, existing architecture, design tokens, Round 2 mockups, tests, and open pull requests. Preserve approved work and the existing Obsidian visual language. This document proposes requirements and acceptance gates; it does not claim those features are already implemented.

Known historical checkpoint (unverified): setup/database merged; Round 2 mockups for Overview, Apps, App detail, Notices and Sources awaiting approval; PR \#33 implements 90/60/30-day email notice-deadline alerts and had passed checks. Confirm all three before changing code.

# 1. Product strategy & positioning

## 1.1 Positioning

App Register is an application health and lifecycle monitoring service for lean IT teams (typically 1–5 people) in organizations of roughly 30–500 employees. It tracks both purchased SaaS and internally built applications, ties relevant changes to affected apps, and surfaces the next useful action.

Suggested headline: “Know what your applications depend on—and what needs attention.”

Supporting copy: “Monitor app health, dependencies, software support, vendor notices, hosting changes, and renewal deadlines in one calm workspace.”

## 1.2 Customer job & value

The primary user is an IT manager or systems administrator who owns a mixed application portfolio but lacks time for continuous manual checking. Their job: answer “What requires attention now, why, and who should do what?” within one minute of login.

| **Do compete on**                                      | **Do not compete on**                      |
|--------------------------------------------------------|--------------------------------------------|
| Reliable portfolio-specific relevance and next actions | A generic inventory database alone         |
| Clear evidence, ownership and follow-through           | A broad enterprise CMDB / ITSM suite       |
| Minimal upkeep and fast onboarding                     | Incident response, ticketing or SIEM       |
| SaaS + internally developed application context        | Unsubstantiated AI magic or opaque scoring |

## 1.3 Research basis and uncertainty

Customer discussions show recurring friction with manual renewal tracking, fragmented ownership and end-of-life monitoring; other administrators report that their existing CMDBs or calendars work fine. Competitors such as Metaport, Setyl, Hudu, Snipe-IT and Dependency-Track solve overlapping problems. The specific willingness to pay for one unified product is a hypothesis, not established demand. Prioritize measurable recurring value and small paid pilots over scope expansion.

# 2. Non-negotiable experience principles

| **Principle**                 | **Product rule / measurable test**                                                                 |
|-------------------------------|----------------------------------------------------------------------------------------------------|
| Action-first                  | On login, important issues and next actions precede charts, settings and secondary metrics.        |
| Progressive disclosure        | First layer shows summary, impact, urgency, and action; details and raw evidence appear on demand. |
| Calm by default               | Healthy apps are discoverable but do not dominate attention; avoid alarms without relevance.       |
| Explainability                | Every risk score and alert states cause, affected app, source, freshness and resolution path.      |
| One obvious primary action    | Each view presents one main action; secondary choices stay subordinate.                            |
| Predictable patterns          | Reuse layouts, terminology, filters, icon semantics and keyboard behavior everywhere.              |
| Low maintenance               | Automate discovery where safe; flag stale data; enable easy imports and exports.                   |
| Accessibility and performance | Keyboard usable, screen-reader meaningful, WCAG 2.2 AA target and responsive layouts.              |

North-star usability test: A first-time IT manager must locate the highest-priority item, understand why it matters, and take the correct next action without training.

# 3. Scope and delivery order

| **Tier** | **Capability**               | **Required behavior**                                                                                                |
|----------|------------------------------|----------------------------------------------------------------------------------------------------------------------|
| P0       | Application inventory        | Create/edit/archive SaaS and internal apps; owners; environments; criticality; supplier; clear search/filter.        |
| P0       | Health & explanation         | 0–100 score with transparent contributing findings; uncertainty and stale-data indicators.                           |
| P0       | Relevant notices             | Provider outages/retirements, dependency vulnerabilities/EOL, licensing and pricing notices linked to affected apps. |
| P0       | Renewal deadlines            | Track renewal and cancellation-notice dates separately; 90/60/30-day email reminders, if still appropriate.          |
| P0       | Action workflow              | Review, acknowledge, assign owner, mark handled, snooze with reason; durable audit history.                          |
| P0       | Sources & evidence           | Trace notices to original source, last checked, affected version/service, confidence and matching logic.             |
| P1       | GitHub / Azure DevOps sync   | Read-only import of declared dependencies and repository metadata with explicit permissions.                         |
| P1       | Weekly digest & bulk import  | Relevant weekly summary; CSV import with dry run, validation and duplicate handling.                                 |
| P1       | App relationship view        | Show dependent APIs, data stores and services only where verified.                                                   |
| P2       | Smart summarization & trends | Human-checkable notice summaries; score history and reporting/export.                                                |

Avoid in the initial release: incident command center, universal cloud auto-discovery, ticketing suite, broad procurement, endpoint monitoring, automated remediation and multi-tenant MSP billing.

# 4. Information architecture & navigation

Four primary navigation destinations: Overview, Applications, Notices, Settings. “Sources” must remain accessible as a focused view (for example within Settings \> Monitoring sources) unless existing approved mockups establish a compelling reason for a first-class page. Preserve the Round 2 Sources work; do not delete it merely to reduce navigation.

| **Location**       | **Question answered**         | **Primary content / action**                                                             |
|--------------------|-------------------------------|------------------------------------------------------------------------------------------|
| Overview           | What needs attention today?   | Prioritized attention queue, monitored portfolio summary, freshness/errors; Review item. |
| Applications       | What do we manage?            | Searchable/filterable catalog; add/import app.                                           |
| Application detail | Is this app healthy, and why? | Health drivers, dependencies, provider, contracts, activity; address a finding.          |
| Notices            | What changed or is due?       | Grouped actionable notice inbox; filter, acknowledge, assign/snooze.                     |
| Settings / Sources | Where does data come from?    | Integrations, check status, notification rules, users, data management.                  |

## 4.1 Page hierarchy

Overview: concise heading + last successful check → 1–3 key numbers → urgent attention queue → upcoming dates → monitored apps summary → secondary activity. Do not lead with a wall of metric cards.

Applications: top search and compact filters → sortable dense list → application row with name, type, owner, health and highest active issue → simple add/import. Default sorting favors needs-attention; allow alphabetical and other sorts.

Detail: application identity, owner, environment, source freshness and health summary → “Needs attention” findings → key metadata → sections/tabs for Dependencies, Hosting, Licences and Activity. All information tied to that app stays here.

Notices: relevant-to-my-apps by default → priority, affected app(s), deadline/impact and status → detail drawer/panel including original source → take action in context.

# 5. Critical user journeys & acceptance scenarios

## Journey A — Daily check-in (\<60 seconds for a populated portfolio)

1.  User lands on Overview; sees last-updated time and a clear urgent item count.

2.  Selects the most important item; sees the affected application, impact, exact source and recommended next step.

3.  Acknowledges or assigns it with optional note; list updates immediately and provides undo/confirmation.

4.  Returns to Overview with updated status; no accidental disappearance of unhandled risks.

## Journey B — Add an application (target: under 2 minutes manually)

5.  Choose “Add application” (SaaS or Internal).

6.  Provide name, criticality and owner; optional fields are genuinely optional.

7.  Add vendor/hosting/repository/contract details now or later.

8.  Review created record and recommended setup checklist; no fabricated health score when sources are absent.

## Journey C — Triage an EOL/vulnerability notice

9.  Open a notice from Overview or Notices; see affected application and component/version.

10. Inspect primary source, published time, detected time, support end date / advisory identifier, and match reason.

11. Choose follow-up action: assign, acknowledge, snooze with reason, or mark handled with evidence.

12. If status changes upstream, notice updates without overwriting user audit history.

## Journey D — Renewal/cancellation deadline

13. Register contractual renewal, auto-renew flag and required notice period.

14. System calculates cancellation deadline separately; user verifies date/time zone.

15. Alerts go to configured recipients on applicable 90/60/30-day checkpoints; dedupe notifications.

16. User reviews contract and records decision; overdue status remains visible until explicitly resolved.

## Journey E — First-run & empty state

17. Explain the value in one sentence; offer manual add or CSV import.

18. Show a short three-step onboarding checklist: add apps, connect sources, configure notices.

19. Show example data only if clearly labelled “Demo”; do not make empty inventory look healthy.

# 6. Interaction and content rules

- Use compact tables for comparative scanning; use drawers for quick review and full pages for deep work. Do not nest modals or rely on hover-only actions.

- Present severity and status separately: severity = potential impact; status = new / reviewing / snoozed / handled. An acknowledged critical issue remains critical.

- Standard language: Application, Finding, Notice, Source, Owner, Health, Deadline, Last checked. Avoid incident-response vocabulary.

- Risk messages follow “What happened → Which app is affected → Why we think so → What to do → Source”.

- Buttons use verbs: Review notice, Assign owner, Mark handled, View source. Avoid vague “Manage”.

- Persist search/filter/sort when returning from detail; enable deep links; use deterministic back behavior.

- Empty/loading/error states must explain the situation and next step; skeleton loading should not imply false data.

- Destructive changes require confirmation, show effects and preserve an audit trail; offer undo when technically safe.

- Do not rely on color alone; support semantic text labels, timestamps and discernible focus.

- Provide keyboard shortcuts only for high-value repeat actions, with discoverable documentation and no collisions.

# 7. Visual design system: Obsidian identity

Preserve the approved Round 2 layouts where compatible with this UX specification. Visual references are Linear (hierarchy, restraint, keyboard efficiency) and incident.io (component craft, density, crisp interaction feedback), not pixel-for-pixel clones.

| **Token / element** | **Specification**                                                                                                |
|---------------------|------------------------------------------------------------------------------------------------------------------|
| Brand purple        | \#612CCC — primary interactive/accent color; use sparingly for visual hierarchy.                                 |
| Dark plum           | \#130F1C — primary dark surface / brand shell. Do not force every data surface dark.                             |
| Type                | Poppins for page/section headings; Inter for body, tables and form controls; verify font licensing and fallback. |
| Spacing             | Consistent 4/8px-based scale; give tables comfortable row targets and forms sufficient breathing room.           |
| Typography          | Visible hierarchy; use body sizes readable on laptop screens; avoid micro-label proliferation.                   |
| Surface             | Low-noise backgrounds, subtle borders and restrained elevation; few competing cards.                             |
| Status              | Semantic success/warning/danger tokens tested for contrast; label with words, not color only.                    |
| Motion              | Short purposeful transitions; honor reduced-motion preferences.                                                  |
| Charts              | Only where a historical comparison changes a decision; never decorate Overview with meaningless graphs.          |

Design tokens must be centralized. Prefer existing project components/tokens; use shadcn/ui only if compatible with the repository stack and existing design system. Do not introduce a second visual system to gain a new component.

# 8. Health score and relevance specification

Score definition: 0–100 relative operational-health indicator, not a guarantee of safety. Scoring is a proposal requiring stakeholder approval before production. Always display an explanation, source quality and data coverage.

- Separate severity, exploitability, production exposure, business criticality, time to deadline and confidence. Avoid arbitrary identical deductions for all issues.

- Do not treat unknown or unconnected data as healthy. Display “Insufficient data” if coverage is inadequate; use coverage beside score.

- Show top three deductions and “See scoring details”; document scoring versions and test deterministic calculations.

- Source relevance requires a link between app and affected component/service, region, version or contract. Generic news must not silently lower app health.

- Stale source checks must be visible and must not falsely imply the app is safe; retain last valid reading and mark it stale.

- Dismissed or handled findings do not erase the historical source or score rationale.

## Proposed scoring acceptance checks

20. Same inputs and scoring version produce the same score.

21. A dependency not present in an application cannot affect that app’s score.

22. An unverified provider association cannot trigger a high-confidence affected-app claim.

23. A source outage yields stale data state, not a false green health state.

24. Every score change can be explained by an audit event.

# 9. Data, trust, privacy and security

- Core entities: Organization, User/Membership, Application, Owner, Component/Version, Provider/Service/Region, Contract/Deadline, Source, Notice, AppNoticeMatch, Action, AlertDelivery and ScoreSnapshot.

- Multi-tenant isolation is mandatory. Authorize every read/write at service and data layers; do not trust a client-side organization selector.

- Store source URL, published/observed timestamps, origin and dedupe key. Keep external claims distinguishable from user-entered facts.

- Credentials use encrypted storage, least privilege, rotation and revocation. Never log access tokens, contract contents or secrets.

- Webhooks/imports must validate signatures when available and guard against duplicate/out-of-order events.

- Use safe file validation and explicit limits for CSV/contracts; avoid executing imported content and spreadsheet formula injection on export.

- Provide access roles appropriate to small teams: at minimum Admin and Member; use read-only role only when genuinely useful.

- Do not ingest private repository content beyond agreed metadata; explain exactly what integration access is requested.

- Support user-visible export, retention, and deletion paths; do not promise compliance certification without independent evidence.

# 10. Engineering implementation rules for Claude Code

25. Inspect current repo structure, open issues/PRs, package scripts, design tokens, approved mockups, API contracts and test suite. Write a brief gap analysis before implementation. Do not assume PR \#33 or mockups are merged.

26. Build incrementally behind small feature branches/PRs. Preserve existing APIs and data; add migration and rollback plans for schema changes.

27. Implement shared domain types, permission checks, scoring services, source adapters and UI state as testable modules. Keep fetching and presentation separate.

28. For every screen define the user question, primary action, empty/loading/error states, responsive state and accessibility contract before coding.

29. Avoid introducing libraries without a concrete benefit and maintenance rationale. Follow existing frontend tooling; only adopt shadcn/ui / Radix patterns when stack-compatible.

30. Every alert must use idempotent delivery keys and documented scheduling/time-zone behavior. No duplicate email on retries.

31. Provide feature flags or safe rollout for new scoring/monitoring logic; use dry-run where possible before mass notifications.

32. Update documentation and visible product wording together; no claims of automatic coverage unsupported by actual integrations.

# 11. Verification & release gates

| **Gate**           | **Required check / evidence**                                                                                  |
|--------------------|----------------------------------------------------------------------------------------------------------------|
| Design review      | Compare implementation with approved Round 2 comps and design tokens; capture desktop/mobile screenshots.      |
| Journey E2E        | Automate daily triage, add app, view source, handle notice, renewal reminder and no-data state.                |
| Unit / integration | Scoring edge cases, matching logic, permissions, deduplication, dates/time zones, source failures, migrations. |
| Accessibility      | Automated axe-style audit plus manual keyboard/focus, dialog, screen reader spot check; target WCAG 2.2 AA.    |
| Responsive         | Test 360px mobile, tablet and laptop/desktop widths; long names, empty lists and crowded tables.               |
| Performance        | Measure real page interactions; set budgets before launch; avoid loading all detail data on Overview.          |
| Security           | Dependency audit, secrets scan, tenant-isolation tests, authorization negatives, input validation.             |
| Operations         | Monitoring source health, jobs, failed email deliveries, retry/idempotency behavior, error logs and alerts.    |
| Release            | Run repo lint, type check, unit/integration/E2E tests and production build; record results in PR.              |
| Regression         | Visual diff major states; verify app catalog, auth and notice alerts unchanged by unrelated UI edits.          |

## 11.1 PR acceptance template

Each PR description must include: user problem; changed journey(s); screenshots (desktop and mobile); accessibility results; test commands and pass/fail output; migration implications; security/privacy consideration; known limitations; source/score accuracy checks if applicable; rollback method. A green CI badge alone is not evidence of acceptable usability.

## 11.2 Release blockers

- Cross-tenant data access, leaked secrets, untrusted imports executing content, broken authorization or incorrect recipient routing.

- Silent false-positive/false-negative matching likely to mislead on critical risk; unsupported claims about monitored coverage.

- Duplicate deadline emails at scale, missed required deadline alerts, or erroneous date calculations.

- Critical interaction inaccessible by keyboard, irreversible accidental destructive action, or a broken primary daily user journey.

# 12. Roadmap and definition of done

| **Milestone**               | **Output / exit criterion**                                                                                    |
|-----------------------------|----------------------------------------------------------------------------------------------------------------|
| M0 — Baseline               | Repo inspection, PR \#33 status, approved/mockup comparison, user flows and design-token inventory.            |
| M1 — Coherent core          | Overview, Applications, App detail, Notices and Sources experience consistent and usable with demo/test data.  |
| M2 — Trustworthy monitoring | Source checks, app matching, health rationale, real deadline logic and reliable alert delivery.                |
| M3 — Onboarding             | Import/manual setup, clear data-coverage state, first-run prompts and usable weekly digest.                    |
| M4 — Pilot quality          | Usability review with 5 representative IT users; address major task failures and errors; paid pilot readiness. |

Definition of done: A user can add an application, link relevant dependency/provider/contract context, see a sourced finding, decide what to do, record that action and reliably receive an appropriate reminder—without training, misleading confidence or unnecessary navigation.

# 13. Design and implementation references

Use official resources as guidance, not as permission to copy proprietary visual assets. Validate any third-party agent “design skill” before running it; avoid unreviewed repositories with broad permissions.

- Linear product inspiration: https://linear.app/ — study restrained hierarchy, direct manipulation and efficient navigation.

- incident.io product design: https://incident.io/ — component polish and contextual workflows (not its incident terminology).

- shadcn/ui official: https://ui.shadcn.com/ and https://github.com/shadcn-ui/ui — open component code when frontend-compatible.

- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/ — accessible interaction criteria.

- WAI ARIA Authoring Practices: https://www.w3.org/WAI/ARIA/apg/ — keyboard/dialog/table patterns.

- Metaport: https://metaport.sh/ — benchmark application lifecycle and EOL workflows.

- Hudu: https://www.hudu.com/ — benchmark compact IT inventory and expiration workflows.

- Setyl: https://setyl.com/ — benchmark broader software/contract management.

- endoflife.date: https://endoflife.date/ — possible lifecycle source; verify licensing, data quality and API terms before integration.

# 14. Copy-ready Claude Code instruction

Read this specification in full. Before coding, inspect RaisinBread42/app-register and identify current design system, implementation, mockups, existing tests and PR \#33 state. Report: (1) what already exists, (2) conflicts with this document, (3) a prioritized implementation plan and (4) required approvals. Never overwrite existing approved Obsidian Round 2 designs without explaining the tradeoff. Implement small reviewable increments. For each increment, demonstrate the user journey, screenshots, accessibility check, tests and CI results. Treat clear evidence, minimal steps, tenant safety and dependable monitoring as release requirements. Do not add unrelated platform scope.
