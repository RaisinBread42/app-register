# Governance Board — owner addition to spec v1.0

**Added:** 2026-11-28 by the owner. It was left out of [spec-v1.md](spec-v1.md). Issues: [49] board, [50] history, [51] PDF.

## Purpose

Give IT managers, directors and executives a clear view of application governance, operational risk and readiness.

## What it is, and what it is not

- **It is** a lightweight reporting and oversight layer over data App Register already has: apps, owners, notices, actions, audit events, health and deadlines.
- **It is not** a GRC or compliance-management platform. It adds no new monitoring and no new data entry, and it doesn't change the product's positioning (spec §1.1).
- **It is not** another complicated dashboard. It is one page that leads with plain-language sentences, keeps the numbers few, and lets each one drill down into the lists that already exist.

## Functional requirements

1. A health summary across the portfolio.
2. Outstanding vulnerabilities, risks and end-of-life notices.
3. Application ownership and accountability.
4. Overdue actions and upcoming deadlines.
5. Risk severity and remediation status.
6. Historical changes and audit trails.
7. Board-ready PDF reports that can be exported.

## Design requirements

- Obsidian branding and the spec §7 principles (Linear and incident.io restraint): clarity, simplicity, actionable information.
- An executive summary first. IT administrators drill down from there.
- Reuse the existing application, notice and health data and services.
- Automated tests, accessibility checks (axe, keyboard) and visual verification (screenshots at 360, 768 and 1280 px) for every part.
