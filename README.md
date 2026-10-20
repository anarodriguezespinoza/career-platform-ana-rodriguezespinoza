# Personal Resume and Career Platform

A FastAPI application with server-rendered Jinja templates and SQLAlchemy/Alembic, running on [Railway](https://railway.com) with PostgreSQL at **https://anarodriguezespinoza.com**. The code also supports Cognito sign-in, SES notifications, and an S3 snapshot fallback for public content; those integrations are not configured in the Railway deployment (see [What is turned off](#what-is-turned-off)).

## How the site runs

| Piece | Where |
| --- | --- |
| Web app | Railway project `rare-smile`, environment `production`, service `career-platform-ana-rodriguezespinoza` |
| Source | GitHub `main`; Railway builds the `Dockerfile` and redeploys on every push to `main` |
| Database | Railway PostgreSQL service `Postgres` (PostgreSQL 18), reached over Railway's private network |
| Domain | `anarodriguezespinoza.com`, DNS on Cloudflare: a DNS-only `CNAME` to Railway, plus Railway's `_railway-verify` `TXT` record |

`railway.json` configures each deploy:

- **Build:** the `Dockerfile`. The container runs `uvicorn` as a non-root user on Railway's `$PORT` (default `8000`) and trusts Railway's `X-Forwarded-*` headers.
- **Migrations:** `alembic upgrade head` runs as the pre-deploy command, once per deploy before traffic moves. Containers never migrate on start-up.
- **Health check:** Railway checks `/api/health` before the new deploy goes live, and restarts the service on failure.

The web service has three variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}`, a reference that Railway resolves to the private `postgres.railway.internal` URL |
| `APP_ENV` | `production` (marks the session cookie `Secure`) |
| `SITE_URL` | `https://anarodriguezespinoza.com`, used for canonical URLs, `robots.txt`, and the sitemap |

Never commit or print the database URLs. Read them through the Railway CLI or dashboard.

### What is turned off

`COGNITO_*`, `S3_SNAPSHOT_*`, and `SES_*` are unset on Railway, so:

- **Admin sign-in (`/admin`) doesn't work.** Edit content directly in the database (see [Operating the site](#operating-the-site)) and set `publicationState` to `PUBLISHED` for it to appear publicly.
- **Contact submissions are saved** to `ContactInquiry` with `notificationStatus = FAILED`, because no email is sent.
- **There is no snapshot fallback.** If the database is down, public pages return 503, and `/api/health` returns `{"status":"unavailable",...}` with HTTP 503.

A healthy deploy returns `{"status":"ok","database":"up","publicSource":"database"}`.

## Operating the site

Install the [Railway CLI](https://docs.railway.com/cli) (`brew install railway`), then sign in and link this folder to the web service:

```bash
railway login
railway link --project rare-smile --environment production --service career-platform-ana-rodriguezespinoza
```

Common tasks:

```bash
railway deployment list                  # recent deployments and their status
railway logs --deployment --lines 100    # app logs for the latest deployment
railway logs --build --lines 100         # build logs
railway domain list                      # domains (plain `railway domain` CREATES one)
railway variables --json | python3 -c "import json,sys; print(sorted(json.load(sys.stdin)))"   # variable names only
curl -sS https://anarodriguezespinoza.com/api/health
```

To run a local script against the production database, use `railway run --service Postgres -- <command>`. It injects the Postgres service's variables. Use `DATABASE_PUBLIC_URL`, because the private URL only resolves inside Railway. To move rows from an older SQLite database into an empty, already-migrated database:

```bash
python -m app.copy_database SOURCE_URL TARGET_URL   # prints row counts only; refuses a non-empty target
```

## Local development

1. Copy `.env.example` to `.env` and provide local development values. The default `DATABASE_URL` is a local SQLite file.
2. Create a virtual environment and install dependencies:

   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   pip install -e ".[dev]"
   ```

3. Create and seed the local database, then start the server:

   ```bash
   set -a && source .env && set +a
   alembic upgrade head
   python -m app.seed
   uvicorn app.main:app --reload
   ```

   The site runs at http://localhost:8000.

Available checks:

- `ruff check app tests e2e migrations`
- `pytest`. Set `TEST_POSTGRES_URL` to a **throwaway** PostgreSQL database to also run the Postgres migration and copy tests. They drop every table in that database. CI runs them against a `postgres:16` service.
- `pytest e2e` is the release gate. It needs `pip install -e ".[e2e]"`, `playwright install chromium`, and the `E2E_*` variables.

Styles are Tailwind classes in `app/templates/`, compiled to the committed `app/static/css/site.css`. Run `./scripts/build-css.sh` (uses `npx tailwindcss@3`) after changing classes.

## Project layout

- `app/main.py`: application factory and error handlers
- `app/routes/`: public pages, `/api` endpoints, sign-in, and owner-only `/admin` routes
- `app/templates/`: Jinja templates
- `app/domain/`: publication rules, snapshot fallback, admin content service, inquiries, resume PDF
- `app/models.py`, `app/repositories.py`, `migrations/`: database models, data access, Alembic migrations
- `app/copy_database.py`: one-shot SQLite → PostgreSQL row copy
- `Dockerfile`, `railway.json`: container image and Railway deploy configuration
- `tests/`: pytest suite; `e2e/`: Playwright release-gate tests
- `infra/`: AWS CDK (TypeScript), not used by the Railway deployment

## Architecture and operations

- [System architecture](docs/architecture.md): request paths, fallback behavior, health contract, and security boundaries.
- [Database and privacy model](docs/database.md): models, publication states, public projection, inquiries, and migrations.
- [Deployment and recovery](docs/deployment.md): the Railway configuration, release migrations, health verification, and the AWS recovery commands.
- [Glossary](docs/glossary.md): shared platform terminology.
- [System diagram](docs/diagrams/system-architecture.mmd) and [data-model diagram](docs/diagrams/data-model.mmd).

## AWS infrastructure (not currently deployed)

`infra/` defines an AWS alternative with CDK: RDS PostgreSQL, the S3 snapshot bucket, Cognito, SES, and CloudWatch logs. It is kept for reference and CI still synthesizes it, but the live site does not use it. Synthesize it with an explicit environment and a verified SES sender:

```bash
npm ci --prefix infra
npm run build --prefix infra
cd infra && npx cdk synth -c environment=development -c sesFromEmail=verified@example.com && cd ..
```

See [Deployment and recovery](docs/deployment.md) for the full AWS deploy, migration, and recovery procedure.
