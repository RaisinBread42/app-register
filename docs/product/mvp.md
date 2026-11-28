# MVP scope — App Register

> **Superseded for the next iteration** by [spec v1.0](spec-v1.md) and the [Governance Board](governance-board.md) addition; the plan and decisions are in [gap-analysis.md](gap-analysis.md). This page records the first MVP.

Evidence-based must-haves from [validation research](../research/saas-app-register-validation-2026-11-21.md). Keep it stupid simple: no custom fields, no roles matrix, no analytics in v1.

## In scope

| # | Capability | Why |
| --- | --- | --- |
| 1 | One record per app (bought or built), with kind | SaaS and in-house share the same ownership pain |
| 2 | Named owner + backup owner on every app | Most-repeated fix in the threads |
| 3 | Renewal date **and** separate notice-deadline date | Notice deadline is the #1 pain |
| 4 | Alerts at ~90 / 60 / 30 days before the **notice** deadline (email first) | Catch traps before auto-renew |
| 5 | Leaver checklist: list everything a person owns, then reassign | Ownership walks out the door |
| 6 | CSV import and export | Live in an afternoon; leave whenever |
| 7 | Contract attachments on a record | Spreadsheet cannot hold the PDF |
| 8 | In-house fields: where it runs, data/keys touched, what breaks if it stops | Citizen-built and legacy internal apps |
| 9 | Quarterly “still used, still owned?” review | Stops the register going stale |
| 10 | Flat price (pricing page later) | Segment prefers flat fees |

## Out of scope (explicit)

- Automatic discovery (SSO logs, browser extensions)
- Usage / seat analytics and waste scoring
- Automated account provisioning / deprovisioning
- Payment cards and spend capture
- Negotiation benchmarks
- AI contract reading as a headline feature
- Slack / Teams alerts (after email)
- Multi-tenant MSP console (later segment)

## Build order (GitHub issues)

Issues are numbered `[01]…` and labelled for MVP. Each is independently shippable with acceptance criteria and verification steps. Seed data must be made-up only — no real company, client, or employer data.

## Done for MVP

A lean IT user can import a spreadsheet, see owners and notice deadlines, get email alerts, reassign on leavers, attach contracts, document in-house risk, and complete a quarterly review — without discovery or analytics.
