# Railway + PostgreSQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move career-platform from the Azure VM (SQLite, systemd + nginx) to the existing Railway project's web service, backed by the project's existing Railway PostgreSQL, carrying over the VM's data.

**Architecture:** Railway builds the existing `Dockerfile` from `main` on GitHub. A `railway.json` pins the builder, runs `alembic upgrade head` as Railway's **pre-deploy command** (a one-off release step before traffic shifts, matching the repo's existing "containers never migrate on start-up" rule in `docs/deployment.md`), and health-checks `/api/health`. The web service reads Postgres through Railway's private network via a reference variable. A small one-shot copy tool moves rows from the VM's SQLite file into Postgres, converting Prisma-era storage formats.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, psycopg 3 (already a dependency), Docker (python:3.13-slim), Railway (Dockerfile builder, Postgres plugin, Railway CLI).

**Spec:** No separate spec. The request was "inspect my app and plan its move to Railway and PostgreSQL; the Railway project already exists with Postgres and a web service." The inspection findings below serve as the spec.

## What the inspection found (2026-10-08)

- **The code is already Postgres-ready.** `psycopg[binary]` is in `pyproject.toml`. `app/db.py:normalize_database_url` rewrites `postgres://` and `postgresql://` to `postgresql+psycopg://`, which is already tested in `tests/test_observability_config.py:77`. The models and migration `0001` use only portable types (Text, Integer, Boolean, DateTime). **No model or query changes are needed.**
- **What runs today:** the VM runs commit `fb852b2` (branch `python-fastapi`). `main` contains the same app code plus docs only, so Railway deploys `main`.
- **VM data** (`/home/azureuser/career-platform/data.db`, Prisma-created and holding a leftover `_prisma_migrations` table):
  - All content tables (Profile, Experience, Project, ProjectTechnology, Skill, ResumeSettings) have 0 rows.
  - **ContactInquiry has 6 rows** with mixed timestamp storage: 1 row stores `createdAt`/`updatedAt` as **integer milliseconds since epoch** (Prisma format, e.g. `1790113211732`), and 5 rows store **text** (`2026-10-04 21:22:17.867220`). SQLAlchemy's DateTime type cannot read the integer form, so a naive copy would crash. The existing docs (`docs/database.md`) say to recreate Prisma-era SQLite databases, but that would lose these 6 inquiries.
- **Port:** the `Dockerfile` hard-codes `--port 8000`. Railway injects `$PORT`.
- **Config:** public pages, `/api/health`, and contact *storage* need only `DATABASE_URL`. Without SES env vars, a contact submission is still saved and marked `notificationStatus=FAILED` (`app/domain/inquiries.py:148-155`), which is what the VM does today. Admin sign-in (Cognito) and publish-to-S3 stay non-functional, also the same as today, and remain out of scope.
- **Tests only exercise SQLite**, including `tests/test_migrations.py`. Nothing proves the migration runs on Postgres.
- **Railway CLI is not installed**, and the repo has no `railway.json`.
- **`1.env` in the repo root is NOT git-ignored** (only `.env` is). Its contents were not inspected.

## Global Constraints

- Never commit `.env`, `1.env`, or any `*.env` file. Stage files by name only, never `git add -A` or `git add .`.
- Never print or commit `DATABASE_URL` / `DATABASE_PUBLIC_URL` values. Pass them through shell variables.
- Containers never migrate on start-up. Migrations run only as Railway's pre-deploy command.
- Railway deploys branch `main` of `anarodriguezespinoza/career-platform-ana-rodriguezespinoza`.
- Web service variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}` (use the Postgres service's exact name if it isn't `Postgres`), `APP_ENV=production`, `SITE_URL=https://<railway-domain>` with no trailing slash.
- Cognito, S3, and SES variables stay unset, so behavior matches the VM today.
- Never print inquiry content (names, emails, messages). Copy tooling prints row counts only.

## Review Focus

1. **Mixed timestamp formats in one column** (integer ms and text): the copy must convert both, not crash or silently drop rows. Pinned in Task 4.
2. **SQLite booleans stored as 0/1:** they must land as real `boolean` in Postgres. Pinned in Task 4.
3. **Re-running the copy against a populated target:** it must refuse and write nothing, so there are no duplicate-key half-copies. Pinned in Task 4.
4. **Railway assigns a `$PORT` other than 8000:** the container must listen on it, or the health check fails and the deploy never goes live. Pinned in Task 2.
5. **The migration's server defaults on Postgres** (`server_default=sa.false()`, `func.current_timestamp()`, `"0"` for Integer): they must apply cleanly, not only on SQLite. Pinned in Task 3.

---

### Task 1: Keep env files out of git

**Files:**
- Modify: `.gitignore:151` (next to the existing `.env` line)

- [ ] **Step 1: Confirm the gap.** Run `git check-ignore -v 1.env`. Expected: no output, exit 1.
- [ ] **Step 2: Add the pattern `*.env` on the line after `.env`.** `.env.example` doesn't match it, so the template stays tracked.
- [ ] **Step 3: Verify.** Run `git check-ignore -v 1.env; git check-ignore .env.example`. Expected: the first prints `.gitignore:152:*.env	1.env`; the second prints nothing (exit 1).
- [ ] **Step 4: Commit.**
  ```bash
  git add .gitignore
  git commit -m "chore: ignore all *.env files"
  ```

**Result (2026-10-08):** committed as `7e940fe` (14:52 PDT), "chore: ignore all *.env files". On 2026-10-19 `90d8101` dropped a duplicate copy of the rule. Re-checked 2026-10-21: `git check-ignore -v 1.env` matches `*.env`; `.env.example` is still tracked.

---

### Task 2: Make the image Railway-deployable

**Files:**
- Modify: `Dockerfile` (the `EXPOSE`/`CMD` lines)
- Create: `railway.json`
- Modify: `docs/deployment.md`: add a short `## Railway` section after "Application image and release migrations"

**Interfaces:**
- Produces: an image that listens on `${PORT:-8000}`; `railway.json` that Task 5 relies on for builds, migrations, and health checks.

- [ ] **Step 1: Change `CMD` to shell form so `$PORT` expands.** Keep `exec` so uvicorn is PID 1 and receives SIGTERM. Quote `'*'` so the shell doesn't glob it:
  ```dockerfile
  CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
  ```
  Leave `EXPOSE 8000` and the migration comment as they are.
- [ ] **Step 2: Create `railway.json`.**
  ```json
  {
    "$schema": "https://railway.com/railway.schema.json",
    "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
    "deploy": {
      "preDeployCommand": ["alembic upgrade head"],
      "healthcheckPath": "/api/health",
      "healthcheckTimeout": 60,
      "restartPolicyType": "ON_FAILURE",
      "restartPolicyMaxRetries": 10
    }
  }
  ```
- [ ] **Step 3: Build and verify the port and migrations locally.**
  ```bash
  docker build -t career-platform:railway .
  docker run --rm -e DATABASE_URL=sqlite:////tmp/m.db career-platform:railway alembic upgrade head
  docker run -d --name cp-port -p 9000:9000 -e PORT=9000 -e DATABASE_URL=sqlite:////tmp/h.db career-platform:railway
  sleep 3 && curl -sS http://localhost:9000/api/health; docker rm -f cp-port
  ```
  Expected: the migration run ends with `Running upgrade  -> 0001`. The curl returns `{"status":"ok","database":"up","publicSource":"database"}`. The `/tmp` paths are used because `/srv` isn't writable by the `app` user.
- [ ] **Step 4: Document it.** The `## Railway` section in `docs/deployment.md` (5–10 lines) should cover: `railway.json` drives build, pre-deploy migration, and health check; the web service's three variables from Global Constraints; and that Cognito, S3, and SES are intentionally unset.
- [ ] **Step 5: Run the existing checks and commit.**
  ```bash
  uv run ruff check app tests e2e migrations && uv run pytest
  git add Dockerfile railway.json docs/deployment.md
  git commit -m "feat: deploy to Railway with pre-deploy migrations and \$PORT binding"
  ```

**Result (2026-10-08):** committed as `fdc223d` (14:54 PDT): `Dockerfile` `CMD` binds `${PORT:-8000}`, `railway.json` added with `preDeployCommand: alembic upgrade head`, `healthcheckPath: /api/health`, `restartPolicyType: ON_FAILURE`; `docs/deployment.md` gained the Railway section. The local Docker run in Step 3 wasn't recorded at the time. The Railway deploy in Task 5 exercised the same image.

---

### Task 3: Prove the schema on Postgres

**Files:**
- Modify: `tests/test_migrations.py`
- Modify: `.github/workflows/ci.yml` (job `app`)

**Interfaces:**
- Produces: env var `TEST_POSTGRES_URL` (when set, Postgres-backed tests run; when unset, they skip). Task 4 reuses it.

- [ ] **Step 1: Start a local Postgres that matches Railway's major version.** The Railway dashboard shows it on the Postgres service; use 16 if unsure.
  ```bash
  docker run -d --name pg-test -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
  export TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5433/postgres
  ```
- [ ] **Step 2: Parametrize `test_migrations_produce_the_model_schema` over two URLs.** Use the existing SQLite `tmp_path` URL, plus `TEST_POSTGRES_URL` wrapped in `pytest.param(..., marks=pytest.mark.skipif(not os.environ.get("TEST_POSTGRES_URL"), reason="TEST_POSTGRES_URL not set"))`. For Postgres, call `command.downgrade(config, "base")` first so a previously failed run doesn't poison it. Keep the assertions unchanged, and build the engine with `app.db.build_engine(url)` so `postgresql://` is normalized.
- [ ] **Step 3: Add `test_postgres_round_trips_defaults_and_types`** (same skip marker) in `tests/test_migrations.py`. Steps: upgrade to head; insert one `Project` without `is_featured`, `display_order`, or `created_at`, using a raw `INSERT` that sets only `id`, `slug`, `name`, `description`, and `updatedAt`. Then assert:
  ```python
  row = conn.execute(text('SELECT "isFeatured", "displayOrder", "publicationState", "createdAt" FROM "Project"')).one()
  assert row.isFeatured is False
  assert row.displayOrder == 0
  assert row.publicationState == "DRAFT"
  assert isinstance(row.createdAt, datetime)
  ```
  Downgrade to base at the end.
- [ ] **Step 4: Run.** `uv run pytest tests/test_migrations.py -v`. Expected: 3 passed (1 SQLite, 2 Postgres). With `TEST_POSTGRES_URL` unset: 1 passed, 2 skipped.
- [ ] **Step 5: Wire Postgres into CI.** In job `app`, add a `services.postgres` with `image: postgres:16`, env `POSTGRES_PASSWORD: postgres`, ports `5432:5432`, and health options `--health-cmd pg_isready --health-interval 5s --health-retries 10`. Add job-level env `TEST_POSTGRES_URL: postgresql://postgres:postgres@localhost:5432/postgres`.
- [ ] **Step 6: Commit.**
  ```bash
  git add tests/test_migrations.py .github/workflows/ci.yml
  git commit -m "test: run migration schema tests against PostgreSQL"
  ```

**Result (2026-10-08):** committed as `aa37396` (14:55 PDT). CI job `app` runs against a `postgres:16` service with `TEST_POSTGRES_URL` set. That job has passed on every push since, most recently run `39502672154` on `9630190` (2026-10-20). (The separate `e2e` job fails on every push because the Cognito E2E secrets were never configured; see the README's remaining limitations.)

---

### Task 4: SQLite → Postgres copy tool

**Files:**
- Create: `app/copy_database.py` (run as `python -m app.copy_database`, same pattern as `python -m app.seed`)
- Test: `tests/test_copy_database.py`

**Interfaces:**
- Consumes: `app.models.Base.metadata` (tables, column types); `app.db.build_engine(url)`.
- Produces:
  - `coerce_timestamp(value: object) -> datetime | None`
  - `class TargetNotEmptyError(Exception)`, whose message names the non-empty tables
  - `copy_database(source_url: str, target_url: str) -> dict[str, int]`, returning row counts keyed by table name for every table in `Base.metadata`
  - `main(argv: list[str] | None = None) -> int`, CLI: `python -m app.copy_database SOURCE_URL TARGET_URL`. Prints `<table>: <count>` lines only.

**Approach:**
- Read the source with raw `text('SELECT * FROM "<table>"')` so SQLAlchemy's DateTime processor never sees the integer timestamps.
- Iterate `Base.metadata.sorted_tables` (parents before children) and copy only model columns. This skips `_prisma_migrations` and `alembic_version`.
- Pass `DateTime` columns through `coerce_timestamp` and `Boolean` columns through `bool()` (keep `None` as `None`).
- Check that every target table is empty, then insert all rows inside one `engine.begin()` transaction.
- The target schema must already exist, created by the Railway pre-deploy migration. The tool never creates tables.

`coerce_timestamp` rules: `None` → `None`. `datetime` → unchanged. `int`/`float` → treat as **milliseconds** since the Unix epoch, convert to UTC, then make naive (`datetime.fromtimestamp(v / 1000, UTC).replace(tzinfo=None)`). `str` → `datetime.fromisoformat(v)`. Anything else → `TypeError`.

- [ ] **Step 1: Write the failing tests.** Each copy test uses two SQLite files under `tmp_path`, both created with `Base.metadata.create_all(build_engine(url))`.
  ```python
  def test_coerce_timestamp_reads_prisma_milliseconds():
      assert coerce_timestamp(1790113211732) == datetime(2026, 9, 22, 21, 40, 11, 732000)

  def test_coerce_timestamp_reads_sqlalchemy_text():
      assert coerce_timestamp("2026-10-04 21:22:17.867220") == datetime(2026, 10, 4, 21, 22, 17, 867220)

  def test_coerce_timestamp_passes_none_through():
      assert coerce_timestamp(None) is None
  ```
  - `test_copy_database_converts_mixed_rows`: insert into the source with **raw SQL**:
    - two `ContactInquiry` rows: one with integer `createdAt`/`updatedAt` = `1790113211732`, one with text `2026-10-04 21:22:17.867220`. Fill every NOT NULL column.
    - one `Project` with `isFeatured` = `1`, plus one `ProjectTechnology` for it.

    Run `copy_database`, then assert:
    - the result equals `{"Profile": 0, "Experience": 0, "Project": 1, "ProjectTechnology": 1, "Skill": 0, "ResumeSettings": 0, "ContactInquiry": 2}`
    - reading back through an ORM `Session` on the target, both inquiries' `created_at` equal the two expected datetimes above
    - `Project.is_featured is True`
  - `test_copy_database_refuses_non_empty_target`: the target already holds one `Skill`. Assert that `copy_database` raises `TargetNotEmptyError` with `"Skill"` in the message, and that the target's `ContactInquiry` count is still 0.
  - `test_copy_database_into_postgres` (skip unless `TEST_POSTGRES_URL` is set, as in Task 3): `alembic upgrade head` on the Postgres URL, copy the mixed-rows source, assert the same counts, then downgrade to base.
- [ ] **Step 2: Run them to see them fail.** `uv run pytest tests/test_copy_database.py -v`. Expected: collection error `ModuleNotFoundError: No module named 'app.copy_database'`.
- [ ] **Step 3: Implement `app/copy_database.py`** per the Interfaces and Approach above.
- [ ] **Step 4: Run them to see them pass.** `uv run pytest tests/test_copy_database.py -v` with `TEST_POSTGRES_URL` exported: all pass. Then run `uv run ruff check app tests && uv run pytest`: all green.
- [ ] **Step 5: Commit.**
  ```bash
  git add app/copy_database.py tests/test_copy_database.py
  git commit -m "feat: add SQLite-to-Postgres copy tool for the Railway cutover"
  ```

**Result (2026-10-08):** committed as `4e5c814` (14:56 PDT), then `195ff10` (14:58 PDT) so a failed copy never prints inquiry contents (`hide_parameters=True`, error type only). `tests/test_copy_database.py` covers Prisma millisecond timestamps, text timestamps, 0/1 booleans, refusal on a non-empty target, and a Postgres round trip. On 2026-10-21 `app/compare_databases.py` was added to check the copy row by row (see Task 6.6).

---

### Task 5: Configure and deploy the Railway web service

Ops task. Each step uses the same Where / Run / Check / Undo format as `2026-10-01-operate-the-vm.md`. Record a **Result** line under each step when it's done.

#### 5.1 Install and link the Railway CLI
- **Where:** laptop
- **Run:** `brew install railway && railway login && railway link`. In the prompts, pick the existing project, the production environment, and the **web** service (not Postgres).
- **Check:** `railway status` names the project, environment, and web service.
- **Undo:** `railway unlink`.

#### 5.2 Confirm the web service's source
- **Where:** Railway dashboard → web service → Settings → Source
- **Run:** connect GitHub repo `anarodriguezespinoza/career-platform-ana-rodriguezespinoza`, branch `main`, root directory `/`. Leave the custom build and start commands **empty** so `railway.json` and the `Dockerfile` are in charge.
- **Check:** after Task 2 is pushed, Settings shows "Config from railway.json", with the pre-deploy command `alembic upgrade head` and health check path `/api/health`.
- **Undo:** disconnect the repo in the same panel.

#### 5.3 Set the web service variables
- **Where:** laptop (the CLI is linked to the web service)
- **Run:** first confirm the Postgres service's name with `railway status` or in the dashboard. Then:
  ```bash
  railway variables --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --set APP_ENV=production
  railway domain    # generates https://<name>.up.railway.app if none exists
  railway variables --set SITE_URL=https://<name>.up.railway.app
  ```
  The single quotes keep the shell from expanding `${{...}}`. Railway resolves the reference to the **private** `postgres.railway.internal` URL, so the database never needs to be reachable from the internet.
- **Check:** `railway variables --kv | cut -d= -f1` lists `APP_ENV`, `DATABASE_URL`, and `SITE_URL`, printing names only.
- **Undo:** `railway variables --remove <NAME>` (or remove them in the dashboard).

#### 5.4 Deploy
- **Where:** laptop
- **Run:** push the Tasks 1–4 commits to `origin/main`. Railway auto-deploys on push. **Confirm with the user before pushing.**
- **Check:**
  - The deploy logs (`railway logs --deployment`) show the pre-deploy step ending in `Running upgrade  -> 0001` and the deployment becoming **Active**.
  - `curl -sS https://<name>.up.railway.app/api/health` returns `{"status":"ok","database":"up","publicSource":"database"}`.
  - `/` and `/projects` return 200.
- **Undo:** in the dashboard, use Deployments → Remove on the deployment. The VM is untouched until Task 6.

**Result:**
- 5.1–5.3: done on 2026-10-08. The README records project `rare-smile`, environment `production`, service `career-platform-ana-rodriguezespinoza`, a Postgres 18 service named `Postgres`, and the three variables `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `APP_ENV=production`, `SITE_URL=https://anarodriguezespinoza.com`.
- 5.4: Railway's certificate for `anarodriguezespinoza.com` was issued 2026-10-08 21:23 UTC, and the Cloudflare `CNAME @ → jf53ce39.up.railway.app` and `_railway-verify` TXT were created 2026-10-08 22:18–22:19 UTC (see `docs/evidence/dns-records-final.md`).
- Deployment history (`railway deployment list`, read 2026-10-25): the first deployment was `b362f124` at 2026-10-08 21:27 UTC, built from `0f454a5`, which is **before** the Task 1–4 commits. Those commits were committed on 2026-10-08 on branch `railway-migration` but only reached `main` on 2026-10-20. So the first deployment that used `railway.json` (pre-deploy `alembic upgrade head`, `$PORT`, health check) was **`30d66d37` at 2026-10-20 05:14 UTC** (commit `90d8101`). Deployments before it ran the old image, with a hard-coded port 8000 and no pre-deploy migration.
- 2026-10-21 to 2026-10-25: the custom domain returned `502` (Railway incident, then a `PORT` mismatch). Fixed 2026-10-25, see "Recovering from the Railway incident" below. Current deployment: `11a6840a` (2026-10-26 05:16 UTC, commit `57209d8`), `SUCCESS`.

---

### Task 6: Cut over the data and retire the VM app

#### 6.1 Freeze writes on the VM
- **Where:** VM (`ssh -i ~/.ssh/isba4775_azure azureuser@9.205.26.169`)
- **Run:** `sudo systemctl stop career-platform`
- **Why:** no new contact inquiries can land in SQLite after the copy is taken.
- **Check:** `curl -sS -o /dev/null -w '%{http_code}' http://9.205.26.169/` returns `502`, because nginx is up and the app is down.
- **Undo:** `sudo systemctl start career-platform`.

#### 6.2 Pull the SQLite file to the laptop (outside the repo)
- **Where:** laptop
- **Run:** `mkdir -p ~/career-platform-cutover && scp -i ~/.ssh/isba4775_azure azureuser@9.205.26.169:career-platform/data.db ~/career-platform-cutover/data.db`
- **Check:** `ls -l` shows 114688 bytes (or the current size on the VM). `sqlite3 ~/career-platform-cutover/data.db 'select count(*) from "ContactInquiry";'` returns `6`, or more if inquiries arrived after 2026-10-08.
- **Undo:** `rm -rf ~/career-platform-cutover`.

#### 6.3 Copy into Railway Postgres
- **Where:** laptop, repo root
- **Run:**
  ```bash
  TARGET="$(railway variables --service Postgres --kv | sed -n 's/^DATABASE_PUBLIC_URL=//p')"
  uv run python -m app.copy_database "sqlite:///$HOME/career-platform-cutover/data.db" "$TARGET"
  unset TARGET
  ```
  This uses the **public** proxy URL only because the laptop is outside Railway's private network. The URL is never echoed.
- **Check:** the output shows `ContactInquiry: 6` (matching 6.2) and `0` for the content tables. `railway connect Postgres`, then `select count(*) from "ContactInquiry";`, returns the same number.
- **Undo:** in `railway connect Postgres`, run `TRUNCATE "ContactInquiry", "ProjectTechnology", "Project", "Experience", "Skill", "ResumeSettings", "Profile";`.

#### 6.4 Verify on Railway
- **Where:** laptop
- **Run:** `curl -sS https://<name>.up.railway.app/api/health`, then submit one test message through `/contact` in a browser.
- **Check:** health is `ok`. `select count(*) from "ContactInquiry";` goes up by 1, with `notificationStatus = 'FAILED'` (expected, since SES is unset).
- **Undo:** `DELETE FROM "ContactInquiry" WHERE id = '<test id>';`

#### 6.5 Retire the VM app (decision point: ask the user first)
- **Where:** VM, then laptop
- **Run:** `sudo systemctl disable career-platform` (on the VM). Then, if the user confirms the VM has no other use: `az vm deallocate -g rg-career-platform -n vm-career-platform`.
- **Why:** deallocation stops compute billing. Disk storage still bills.
- **Check:** `az vm show -d -g rg-career-platform -n vm-career-platform --query powerState -o tsv` returns `VM deallocated`.
- **Undo:** `az vm start -g rg-career-platform -n vm-career-platform`, then `sudo systemctl enable --now career-platform`. The SQLite file is unchanged on the VM.

**Result:**
- 6.1 / 6.2: the VM's `data.db` was last modified **2026-10-06 18:44** (VM time, UTC), before the copy on 2026-10-08, and it still holds `ContactInquiry: 6`, `Project: 0`, `Profile: 0` (checked 2026-10-21). No write reached SQLite after the copy was taken. The app service on the VM is running again (it was restarted for the 2026-10-21 reboot test), so the VM still serves its own copy at `9.205.26.169`. It no longer receives domain traffic, because `@` points at Railway and `www` redirects to `@` (2026-10-22 01:44 UTC).
- 6.3 / 6.4: no output from the copy run was saved, but 6.6 shows that it ran and was complete: all 6 inquiries are in Postgres unchanged. Whether the 6 inquiries are in Postgres is checked by 6.6 (comparison), using the VM file copied on 2026-10-25 (`~/career-platform-cutover/data-2026-10-25.db`, SHA-256 prefix `441d75db11ac6706`, identical to the VM's `data.db`; 6 ContactInquiry rows, 1 with integer and 5 with text `createdAt`, and 0 content rows). Post-cutover checks on 2026-10-25 after the recovery: `/api/health` `ok`, `/` `200` (`docs/evidence/https-checks.md`).
- 6.5: **not done, on purpose.** The VM stays running: Project 1 requires the Azure deployment to remain up. See the reconciliation note below.

#### 6.6 Compare source and target (added 2026-10-21)
- **Where:** laptop, repo root
- **Run:**
  ```bash
  scp -i ~/.ssh/isba4775_azure azureuser@9.205.26.169:career-platform/data.db ~/career-platform-cutover/data-2026-10-21.db
  TARGET="$(railway variables --service Postgres --kv | sed -n 's/^DATABASE_PUBLIC_URL=//p')"
  .venv/bin/python -m app.compare_databases "sqlite:///$HOME/career-platform-cutover/data-2026-10-21.db" "$TARGET"
  unset TARGET
  ```
- **Why:** row counts alone can't tell a copy from a re-seed. `compare_databases` matches rows by primary key and compares every column after the copy tool's conversions, and prints counts only. The six inquiries, with their original ids and Prisma-era timestamps (one stored as integer milliseconds), can't be produced by `python -m app.seed`, which creates no inquiries. If they match, the original data was transferred.
- **Check:** `ContactInquiry | 6 | N | 6 | 0 | 0 | N-6`: all 6 source rows `matched`, none `changed` or `missing`. `extra` counts inquiries submitted on Railway after cutover, plus the content rows added on 2026-10-21. Exit code `0`.
- **Result (2026-10-25 22:26 PDT):** `ContactInquiry | 6 | 10 | 6 | 0 | 0 | 4`: all 6 source rows matched, none changed or missing, and 4 inquiries were written on Railway after cutover. `Skill | 0 | 2 | 0 | 0 | 0 | 2`: two skills added directly in Postgres after cutover. Every other table is `0 | 0`. Full output: `docs/evidence/migration-comparison.md`. Public Access was turned on for this run only.

### Reconciling this plan with the Project 1 requirements (2026-10-21)

This plan was written as a move to Railway's generated domain only, and two of its choices conflict with the course requirements. Where they differ, the requirements win:

1. **"Out of scope: a custom domain"** is superseded. The site runs at `https://anarodriguezespinoza.com` on Railway (Cloudflare `CNAME @`, DNS only, Railway-issued certificate), `www` redirects to the root, and `SITE_URL` is the custom domain.
2. **Step 6.5 (deallocate the VM)** is not carried out. Project 1 requires the Azure VM to remain running, so the VM stays up with `career-platform` enabled (2 workers, reboot verified 2026-10-21; see the operate-the-vm plan §4). It no longer receives the domain's traffic. Rollback to it is in the README.
3. **"A real change to the original data before the copy":** the copy on 2026-10-08 moved 6 real contact inquiries and no content rows, so there was nothing to edit in content. A later re-seed can't imitate those inquiries, and 6.6 checks them row by row against the VM's untouched SQLite file. That comparison is the evidence that the original data, not a re-seed, is in Postgres.


### Recovering from the Railway incident (2026-10-21)

Railway reported a platform outage with a security notice on 2026-10-21. Builds and the API were down, the site returned `502`, and the CLI login was invalidated. Do these steps in order once the [status page](https://status.railway.com) shows Builds as operational. They follow Railway's published guides ("Rotate PostgreSQL Database Credentials", "Redeploy Buckets and Reconnect GitHub After the Credential Reset", "Check for Anomalous GitHub Access").

#### R.1 GitHub (done 2026-10-21)
- **Result:** no deploy keys, webhooks, or Actions secrets on the repository. The only collaborator is `anarodriguezespinoza` (admin), and the last 30 repository events are all my own pushes and branch changes. Still to do by hand: review github.com/settings/security-log (filter `operation:authentication`), github.com/settings/applications, SSH keys, and personal access tokens. `gh` lacks the scopes to list keys.

#### R.2 Log in again and reconnect GitHub
- **Where:** laptop, then Railway dashboard
- **Run:** `railway login`, then `railway link --project rare-smile --environment production --service career-platform-ana-rodriguezespinoza`. In the dashboard: railway.com/account → reconnect GitHub. Accept any pending permission update at github.com/apps/railway-app/installations/new. Open the web service → Settings → Source and confirm repo `anarodriguezespinoza/career-platform-ana-rodriguezespinoza`, branch `main`, and that autodeploy is **enabled**.
- **Check:** `railway status` names the project, environment, and service.
- **Result:** done 2026-10-25. `railway status` shows project `rare-smile`, environment `production`, service `career-platform-ana-rodriguezespinoza` in region `iad`. Reconnecting GitHub found no pending permissions to accept.

#### R.3 Turn off Postgres public access
- **Where:** Postgres service → Settings → Networking
- **Run:** disable **Public Access** (the TCP proxy). Turn it back on only for 6.6 or a rollback export, then off again.
- **Why:** while it's on, a leaked password works from anywhere.
- **Result:** already off on 2026-10-25. The Postgres service has no `DATABASE_PUBLIC_URL` and no `RAILWAY_TCP_PROXY_DOMAIN`, so the old password only worked from inside the project's private network.

#### R.4 Rotate the Postgres password
- **Where:** Postgres service → Database → Config → Connection
- **Run:** click **Regenerate**. Don't edit `POSTGRES_PASSWORD`/`PGPASSWORD` by hand and don't run `ALTER USER`, because that puts the variable and the database out of sync.
- **Why:** Railway recommends it after the security notice. The web service uses the reference `${{Postgres.DATABASE_URL}}`, so it picks up the new password on its next deploy. Nothing else holds a pasted copy (the copy and compare commands read `DATABASE_PUBLIC_URL` fresh each time).
- **Check:** the database restarts; the web service fails to connect until R.5.
- **Result:** done 2026-10-25 22:05 PDT. Regenerate redeployed Postgres (`8907765b`) and, at the same moment, the web service (`01fa9b77`). The Postgres logs contain no `authentication failed`.

#### R.5 Redeploy the web service
- **Run:** push `main` (it holds the commits not yet deployed), or `railway redeploy --service career-platform-ana-rodriguezespinoza`.
- **Check:** `railway deployment list` shows a new `SUCCESS` deployment; deploy logs show `alembic upgrade head` finishing and no `password authentication failed`; `curl -sS https://anarodriguezespinoza.com/api/health` → `{"status":"ok","database":"up","publicSource":"database"}`. Record the deployment ID in `docs/evidence/reviewed-change.md`.
- **Result:** done 2026-10-25, with one extra fix. After R.4 the site still returned `502` although `01fa9b77` was `SUCCESS`. Its logs showed `Uvicorn running on http://0.0.0.0:8080`, while `railway domain status anarodriguezespinoza.com` showed target port `8000`. The Dockerfile listens on `${PORT:-8000}`, so Railway had started setting `PORT=8080`, which also explains the `502` since 2026-10-21. The health check still passed because Railway probes the port the app actually listens on. Fix: `railway variables --set PORT=8000` on the web service, then `railway redeploy`. Deployment `ac5a2f78` is `SUCCESS` (commit `9630190`), its logs show port `8000` and no `password authentication failed`, `/` returns `200`, and `/api/health` returns `{"status":"ok","database":"up","publicSource":"database"}`, so the app connects with the new password. The three local commits after `9630190` are not yet pushed or deployed.

#### R.6 Look for misuse
- **Run:** `railway connect Postgres`, then:
  ```sql
  SELECT pid, usename, client_addr, application_name, backend_start, state FROM pg_stat_activity WHERE datname = current_database();
  SELECT rolname FROM pg_roles;
  SELECT count(*) FROM "ContactInquiry";
  SELECT extname FROM pg_extension;
  ```
- **Check:** only the app's sessions and your own; no unexpected roles or extensions; the inquiry count is 6 plus the inquiries submitted on Railway since cutover. Then run 6.6 (`compare_databases`): the 6 original inquiries must still be `matched`, not `changed`. Search the deploy logs for `authentication failed`. PostgreSQL doesn't log successful logins by default, so a clean search doesn't prove there was no access.
- **Result (2026-10-25 22:26 PDT):** roles: only `postgres`. Extensions: only `plpgsql`. Sessions: one, `postgres` from `100.64.0.1` (Railway's TCP proxy, i.e. the checks script itself). `ContactInquiry` = 10, which is the 6 original rows (all `matched` by 6.6, so none were altered) plus 4 post-cutover submissions. Nothing unexpected. As the guide warns, Postgres doesn't log successful logins, so this shows no sign of misuse but can't prove there was none. Public Access was already off during the incident (R.3), which limited the old password to Railway's private network.

#### R.7 Re-run the checks
- Re-run the commands in `docs/evidence/https-checks.md` and add a dated "after recovery" section, then fill in `docs/evidence/reviewed-change.md` §3.

---

## Out of scope

- Admin sign-in (Cognito), publish-to-S3 snapshots, and SES notifications. None work on the VM today; they are a separate project.
- A custom domain. The site moves from `http://9.205.26.169` to `https://<name>.up.railway.app`.
- Turning off Railway Postgres's public TCP proxy after the copy. Recommended as a follow-up once 6.3 is done; it is a dashboard toggle.
