# Project 1 submission index

| | |
| --- | --- |
| Repository | https://github.com/anarodriguezespinoza/career-platform-ana-rodriguezespinoza |
| Live site | https://anarodriguezespinoza.com (Railway). `https://www.anarodriguezespinoza.com` redirects to it |
| Azure deployment (kept running) | `vm-career-platform`, public IP `9.205.26.169`, private IP `172.16.0.4`, Denmark East |
| Final deployed commit | `57209d8` on `main`, Railway deployment `11a6840a` (2026-10-26 05:16 UTC, `SUCCESS`). Later commits change only documentation |
| Due | Thursday, October 22, 2026, 1:45 PM |

## Evidence by requirement

| # | Requirement | Where the evidence is |
| --- | --- | --- |
| 1 | Profile and project data: profile kept visible with a 503 and "Projects temporarily unavailable" during a DB outage, empty state, no invented text, recovery without restart, real seed, education and links | Code: `app/routes/public.py` (`_profile_page`), `app/profile_facts.py`, `app/content/profile.json`, `app/templates/public/{home,about,projects,_projects_grid,_profile_facts}.html`, `app/seed.py`. Tests: `tests/test_public_routes.py`, `tests/test_seed.py`. SQLite decision: [README → Decisions](../README.md#decisions). Live check: `/projects`, `/about` (see [reviewed-change.md](evidence/reviewed-change.md) §3) |
| 2 | Azure deployment: workers, controlled reboot, why it worked, private IP / SSH / network rules, page-level DB check, VM running | [operate-the-vm plan §4–5](superpowers/plans/2026-10-01-operate-the-vm.md), [ex03](evidence/ex03.md), [migration comparison](evidence/migration-comparison.md) |
| 3 | Domain and HTTPS: `www` redirect, certificates, renewal, final DNS table | [https-checks.md](evidence/https-checks.md), [dns-records-final.md](evidence/dns-records-final.md), earlier: [dns-before-zoho.md](evidence/dns-before-zoho.md), [encryption.md](evidence/encryption.md) |
| 4 | Railway and PostgreSQL migration: results, data comparison, cutover, rollback, responsibilities | [migration plan](superpowers/plans/2026-10-08-railway-postgres-migration.md) (Results, 6.6, reconciliation note, incident recovery), [migration comparison](evidence/migration-comparison.md), `app/copy_database.py`, `app/compare_databases.py`, [README → Migration](../README.md#migration-azure-vm-to-railway), [README → Rollback](../README.md#rollback) |
| 5 | Reviewed change through Railway | [reviewed-change.md](evidence/reviewed-change.md) |
| 6 | Zoho email | [ex06 §1–2](evidence/ex06.md), [zoho-header-check.md](evidence/zoho-header-check.md), [dns-records-final.md](evidence/dns-records-final.md) |
| 7 | Google Analytics | [ex06 §3](evidence/ex06.md#3-google-analytics) |
| 8 | Engineering record: diagrams, decisions, failures, limitations, reflection, costs | [README](../README.md), [request-path diagrams](diagrams/request-path.md), [system architecture](diagrams/system-architecture.mmd), [spec](superpowers/specs/2026-09-15-personal-resume-career-platform-design.md), [how this site is secured](how-this-site-is-secured.md), [ex05 (simulated)](evidence/ex05.md) |
