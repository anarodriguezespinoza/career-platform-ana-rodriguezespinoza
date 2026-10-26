# Project 1 submission

| | |
| --- | --- |
| Repository | https://github.com/anarodriguezespinoza/career-platform-ana-rodriguezespinoza |
| Live HTTPS URL | https://anarodriguezespinoza.com (Railway). `https://www.anarodriguezespinoza.com` redirects to it with a `301` |
| Final commit SHA | `ae17b6b` |
| Azure VM (kept running until the instructor's cleanup directions) | `vm-career-platform`, resource group `rg-career-platform`, Denmark East, public IP `9.205.26.169`, private IP `172.16.0.4` |

The final commit is the one whose SHA is above and in Brightspace. The commit right after it changes only that line, because a commit can't contain its own hash. The last Railway deployment of application code is `11a6840a` (2026-10-26 05:16 UTC, `SUCCESS`, commit `57209d8`). Later commits change only documentation, and each one redeploys the same code.

All observations below are dated in the linked files, with the commands that were run and their actual output. Anything not verified is marked as such there.

## 1. README, original spec, and plans

- [README](../README.md)
- Original application spec: [2026-09-15 design spec](superpowers/specs/2026-09-15-personal-resume-career-platform-design.md)
- Plans: [application build (2026-09-17)](superpowers/plans/2026-09-17-personal-resume-career-platform.md), [infrastructure (2026-09-22)](superpowers/plans/2026-09-22-task-10-infrastructure.md), [Azure VM migration (2026-09-24)](superpowers/plans/2026-09-24-azure-vm-migration.md), [operate the VM (2026-10-01)](superpowers/plans/2026-10-01-operate-the-vm.md), [Railway + PostgreSQL migration (2026-10-08)](superpowers/plans/2026-10-08-railway-postgres-migration.md)

## 2. Azure and Railway diagrams, including email and analytics

- [Request paths for Railway and Azure](diagrams/request-path.md) (Mermaid, with protocols, ports, locations, the Zoho email path, and the consent-gated GA4 path), rendered as [request-path-railway.png](diagrams/request-path-railway.png) and [request-path-azure.png](diagrams/request-path-azure.png)
- [Current system architecture](diagrams/system-architecture.mmd) (Railway, Cloudflare, Zoho, GA4, and the Azure VM kept as rollback)
- [Data model](diagrams/data-model.mmd)

## 3. Migration plans, data comparison, cutover results, and rollback

- [Railway + PostgreSQL migration plan](superpowers/plans/2026-10-08-railway-postgres-migration.md): Result lines for Tasks 1–6, step 6.6 (comparison), the reconciliation note, and the 2026-10-21 incident recovery (R.1–R.7)
- [Source/target data comparison](evidence/migration-comparison.md) (2026-10-25): all 6 original contact inquiries matched row for row, 0 changed, 0 missing; 4 inquiries written after cutover; the rendered pages compared
- Cutover results: migration plan Task 6 results and [README → Migration](../README.md#migration-azure-vm-to-railway)
- Rollback for code, database changes, and back to Azure including post-cutover writes: [README → Rollback](../README.md#rollback)
- Tools: `app/copy_database.py`, `app/compare_databases.py` (tests in `tests/test_copy_database.py`, `tests/test_compare_databases.py`)

## 4. Azure HTTP/restart evidence and final DNS/HTTPS verification

- Azure HTTP and restart: [operate-the-vm plan](superpowers/plans/2026-10-01-operate-the-vm.md): Nginx on port 80 and no external 8000 (2026-10-01); §4: 2 workers, page-level database check, controlled reboot with the site and database back (2026-10-21); §5: why the restart worked
- Azure VM details, private IP, SSH access, and NSG rules: [ex03](evidence/ex03.md); HTTPS on the VM: [encryption.md](evidence/encryption.md)
- Final DNS: [dns-records-final.md](evidence/dns-records-final.md) (every record with its purpose and verification result; earlier state in [dns-before-zoho.md](evidence/dns-before-zoho.md))
- Final HTTPS: [https-checks.md](evidence/https-checks.md) (`www` redirects, Railway certificate hostname, validity, and renewal; re-run after the Railway recovery on 2026-10-25, all passing)

## 5. Reviewed commit, its Railway deployment, and live verification

- [reviewed-change.md](evidence/reviewed-change.md): commit `74d7a16` (diff review and local `ruff`/`pytest` before the push), deployed as Railway deployment `11a6840a` from `57209d8`, with the behavior observed at `https://anarodriguezespinoza.com` on 2026-10-25/26

## 6. Zoho sending, receiving, replying, and DNS authentication

- [ex06 §1](evidence/ex06.md#1-email-tests): received, replied, and sent tests; the before-MX message; the reply showing the custom address
- [ex06 §2](evidence/ex06.md#2-spf-dkim-and-dmarc-results): SPF, DKIM, DMARC results and what MX, SPF, DKIM, and DMARC do
- [zoho-header-check.md](evidence/zoho-header-check.md): raw headers with a hop-by-hop analysis
- Mail DNS records and their verification: [dns-records-final.md](evidence/dns-records-final.md)

## 7. GA4 page-view and interaction evidence

- [ex06 §3](evidence/ex06.md#3-google-analytics): Realtime screenshots of `page_view` and an outbound `click` (2026-10-19, LinkedIn link on `/resume`), why the event is useful, and the browser → GA collection path through the consent banner

## 8. Failures, decisions, reflection, costs, and remaining limitations

- [README → Investigated failures](../README.md#investigated-failures): port 8000 on Azure (real, with [ex03](evidence/ex03.md)), the `www` record (real), the Railway outage and `PORT` mismatch (real, 2026-10-21 to 2026-10-25), and [ex05](evidence/ex05.md) (a **simulated** lab failure)
- [README → Decisions](../README.md#decisions): SQLite first, the Railway move, managed email, and the outage profile fallback, with alternatives and reasons
- [README → Reflection](../README.md#reflection)
- [README → Costs, credits, and cleanup](../README.md#costs-credits-and-cleanup)
- [README → Remaining limitations](../README.md#remaining-limitations)
- Security notes: [how-this-site-is-secured.md](how-this-site-is-secured.md)
