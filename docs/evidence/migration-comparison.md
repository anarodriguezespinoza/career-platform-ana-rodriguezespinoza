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

## Comparison result

TODO: paste the output of the checks script (run 2026-10-25 or later):

```text
table | source | target | matched | changed | missing | extra
(paste)
```

How to read it:
- `ContactInquiry`: `matched` must be `6`, with `changed 0` and `missing 0`. `extra` is the inquiries submitted on Railway since cutover.
- Content tables: before the seed, `0 | 0` everywhere. After the seed, `extra` equals the seeded rows (1 Profile, 3 Experience, 1 Project, 3 ProjectTechnology, 1 Skill, 1 ResumeSettings) and `missing 0`.
- If `ContactInquiry` shows `missing 6`, the copy in step 6.3 never ran. Run it now as described in the README, then compare again.

## Rendered page

| Page | Azure VM (`curl --resolve … 9.205.26.169`) | Railway (domain) |
| --- | --- | --- |
| `/api/health` | `{"status":"ok","database":"up","publicSource":"database"}` (2026-10-21) | same (2026-10-25) |
| `/projects` | `200`, no projects (0 rows), old template | `200`, "No projects are published yet." (0 rows) before the seed |

Both sides render the same data: no published content. The contact inquiries are private and never rendered, which is why the row comparison above is the real evidence.
