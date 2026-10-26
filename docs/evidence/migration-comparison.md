# Migration comparison: Azure SQLite → Railway PostgreSQL

**Source:** the VM's `data.db`, copied on 2026-10-25 to `~/career-platform-cutover/data-2026-10-25.db` (outside the repo). SHA-256 prefix `441d75db11ac6706`, the same as the file on the VM. Its last modification was 2026-10-06 18:44 UTC, so nothing has written to it since before the cutover.
**Target:** Railway Postgres (`Postgres` service, project `rare-smile`, production).
**Tool:** `python -m app.compare_databases SOURCE TARGET`, which matches rows by primary key, compares every model column after the copy tool's conversions, and prints counts only (never names, emails, or messages).

## Source contents (verified 2026-10-25)

| Table | Rows |
| --- | --- |
| Profile, Experience, Project, ProjectTechnology, Skill, ResumeSettings | 0 each |
| ContactInquiry | 6 (`createdAt` stored as integer milliseconds in 1 row, as text in 5) |

Why this proves the transfer: `python -m app.seed` creates no contact inquiries, and nothing else can recreate these six rows with the same ids, the same Prisma-era timestamps, and the same contents. If all six show as `matched` in the target, the original data, not a re-seed, is in Postgres.

## Comparison result (2026-10-26 05:26 UTC = 2026-10-25 22:26 PDT, before seeding)

```text
table | source | target | matched | changed | missing | extra
ContactInquiry | 6 | 10 | 6 | 0 | 0 | 4
Experience | 0 | 0 | 0 | 0 | 0 | 0
Profile | 0 | 0 | 0 | 0 | 0 | 0
Project | 0 | 0 | 0 | 0 | 0 | 0
ResumeSettings | 0 | 0 | 0 | 0 | 0 | 0
Skill | 0 | 2 | 0 | 0 | 0 | 2
ProjectTechnology | 0 | 0 | 0 | 0 | 0 | 0
```

- **ContactInquiry:** all **6** source rows are in Postgres with every column identical after conversion, including the row whose timestamps were stored as Prisma integer milliseconds. None changed, none missing. The **4 extra** are inquiries submitted on Railway after cutover (Postgres has 1 inquiry from September and 9 from October, against 1 and 5 in the source). These 4 rows exist only in Postgres, which is why the README's rollback exports Postgres back to SQLite instead of reusing the VM file.
- **Skill:** 2 rows were added directly in Postgres after cutover ("Microsoft Azure" under Cloud, "Linux & nginx" under Infrastructure, both visible on `/skills`). They are post-cutover changes, not part of the transfer.
- All other tables are empty on both sides.

Conclusion: the original database was transferred row for row, and the target has since diverged only by new writes.
## After seeding real content (2026-10-26 05:30 UTC)

`python -m app.seed` was run against production with the same script, then compared again:

```text
table | source | target | matched | changed | missing | extra
ContactInquiry | 6 | 10 | 6 | 0 | 0 | 4
Experience | 0 | 3 | 0 | 0 | 0 | 3
Profile | 0 | 1 | 0 | 0 | 0 | 1
Project | 0 | 1 | 0 | 0 | 0 | 1
ResumeSettings | 0 | 1 | 0 | 0 | 0 | 1
Skill | 0 | 3 | 0 | 0 | 0 | 3
ProjectTechnology | 0 | 3 | 0 | 0 | 0 | 3
```

The seed added exactly its rows (Skill went from 2 to 3 with `skill-python`) and didn't touch any inquiry: the 6 originals are still `matched`. The sessions list showed the web app's connection from Railway's private IPv6 network (`fd12:…`, idle) and the script's own connection through the TCP proxy (`100.64.0.3`).

## Rendered page

| Page | Azure VM (`curl --resolve … 9.205.26.169`) | Railway (domain) |
| --- | --- | --- |
| `/api/health` | `{"status":"ok","database":"up","publicSource":"database"}` (2026-10-21) | same (2026-10-25) |
| `/projects` | `200`, no projects (0 rows), old template | `200`, "No projects are published yet." (0 rows) before the seed |
| `/skills` | no skills (0 rows) | Microsoft Azure, Linux & nginx (the 2 post-cutover rows) |

Both sides render the same data: no published content. The contact inquiries are private and never rendered, which is why the row comparison above is the real evidence.
