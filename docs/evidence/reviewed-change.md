# Reviewed change through Railway

**Change:** keep the profile visible during a database outage, show a deliberate empty state, remove invented profile text, and seed only real content.
**Commit:** `74d7a16` "feat: keep the profile up when the database is down"
**Railway deployment:** `11a6840a-7eb7-4f2c-ad47-19848bb3d9d7`, built from pushed `main` at `57209d8` (which contains `74d7a16`), created 2026-10-26 05:16:15 UTC, status `SUCCESS`

## 1. Diff review (before committing, 2026-10-21)

Reviewed with `git diff` on `app/routes/public.py`, the three public templates, `app/seed.py`, and the new files.

| Question | Finding |
| --- | --- |
| Does the outage path only affect what it should? | Only `/`, `/about`, and `/projects` catch `PublicContentUnavailableError`. Every other public page still raises it and gets the existing 503 "temporarily unavailable" page. Admin and `/api/health` are unchanged |
| Could the fallback leak private data? | No. `app/content/profile.json` holds only what the public resume page already shows (name, headline, summary, location, public email, education, LinkedIn and GitHub URLs). It never reads drafts or inquiries |
| Is the status right? | `503` whenever the live read and the snapshot both failed, `200` otherwise. Railway's health check uses `/api/health`, so a 503 page can't block a deploy |
| Does it recover without a restart? | Nothing is cached between requests: every request tries the database first. Pinned by `test_recovers_without_restart_when_database_returns` |
| Invented text left in templates? | Removed: "Building thoughtful digital products…", "A portfolio of experience…", `hello@example.com`, "Available remotely", "Professional summary unavailable." Pinned by `test_missing_profile_row_shows_no_invented_text` |
| Seed safety | Seed rows are real (from the resume page), keyed by fixed ids and only inserted when missing, so re-running never duplicates or overwrites. The invented "Software Engineer at Career Platform, 2024" entry is gone. Pinned by `test_seed_is_real_idempotent_and_renders` |
| Packaging | `content/*.json` added to `package-data`; the Docker image copies `app/` whole, so the file ships either way |

## 2. Local check (before pushing, 2026-10-21)

```text
$ .venv/bin/ruff check app tests e2e migrations
All checks passed!
$ .venv/bin/pytest -q
118 passed, 3 skipped in 1.27s
```

The 3 skipped tests are the Postgres ones that need `TEST_POSTGRES_URL`. CI's `app` job runs them against `postgres:16`.

New tests written first and seen failing (4 failed, 12 passed) before the implementation:
`test_database_failure_keeps_profile_visible_and_returns_503`, `test_recovers_without_restart_when_database_returns`, `test_empty_projects_table_shows_empty_state`, `test_missing_profile_row_shows_no_invented_text`, `test_profile_shows_education_and_links`.

## 3. Behavior observed at the domain after the deploy

Pushed 2026-10-25 22:16 PDT (`9630190..57209d8 main -> main`); observed 2026-10-25 22:17 PDT (2026-10-26 05:17:31 UTC):

| Check | Command | Expected | Observed |
| --- | --- | --- | --- |
| Deploy went live | `railway deployment list` | new deployment `SUCCESS`, matching commit | `11a6840a` `BUILDING` → `DEPLOYING` → `SUCCESS`, commit `57209d8`; log `Uvicorn running on http://0.0.0.0:8000` |
| Health | `curl -sS https://anarodriguezespinoza.com/api/health` | `{"status":"ok","database":"up","publicSource":"database"}` | same |
| Pages | `curl -o /dev/null -w '%{http_code}'` on `/`, `/about`, `/projects` | `200` | `200`, `200`, `200` |
| Education and links | `curl -sS https://anarodriguezespinoza.com/about \| grep -o …` | `Loyola Marymount University`, LinkedIn and GitHub URLs | all three present (new behavior; before this deploy `/about` had no education or links) |
| No invented text | `curl -sS https://anarodriguezespinoza.com/about \| grep -c "hello@example.com"` | `0` | `0` |
| Empty state | `curl -sS https://anarodriguezespinoza.com/projects \| grep -o "No projects are published yet."` | match while production has no project rows | match (new behavior; before, the grid was silently empty) |
| Real project | `curl -sS https://anarodriguezespinoza.com/projects \| grep -o "This website (in progress)"` | match after `app.seed` runs on production | match at 2026-10-26 05:31 UTC, after the seed ran at 05:30 UTC. `/projects/this-website` `200`; `/experience` lists Hatch Baby, EY, Romo & Cabrini and no "Career Platform"; `/api/resume` now returns `application/pdf` because a published Profile and ResumeSettings exist |

## 4. How to undo it

Code: redeploy the previous deployment in Railway, or `git revert <sha>` and push (README → Rollback). Data: the seed only inserts rows with ids `profile-ana`, `experience-hatch`, `experience-ey`, `experience-romo-cabrini`, `project-this-website`, `skill-python`, `resume-settings-default`. Delete those ids (child `ProjectTechnology` rows first) to remove it.
