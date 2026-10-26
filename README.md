# Personal Resume and Career Platform

A FastAPI application with server-rendered Jinja templates and SQLAlchemy/Alembic, running on [Railway](https://railway.com) with PostgreSQL at **https://anarodriguezespinoza.com**. The code also supports Cognito sign-in, SES notifications, and an S3 snapshot fallback for public content; those integrations are not configured in the Railway deployment (see [What is turned off](#what-is-turned-off)).

## How the site runs

| Piece | Where |
| --- | --- |
| Web app | Railway project `rare-smile`, environment `production`, service `career-platform-ana-rodriguezespinoza` |
| Source | GitHub `main`; Railway builds the `Dockerfile` and redeploys on every push to `main` |
| Database | Railway PostgreSQL service `Postgres` (PostgreSQL 18), reached over Railway's private network |
| Domain | `anarodriguezespinoza.com`, DNS on Cloudflare: a DNS-only `CNAME` to Railway, plus Railway's `_railway-verify` `TXT` record. `www` is a proxied record that a Cloudflare redirect rule sends to the root with a `301` |
| Email | Zoho Mail for `ana@anarodriguezespinoza.com` (MX, SPF, DKIM, DMARC on Cloudflare) |
| Analytics | Google Analytics 4 (`G-JH0KBKW3K9`), loaded only after the visitor accepts the consent banner |

`railway.json` configures each deploy:

- **Build:** the `Dockerfile`. The container runs `uvicorn` as a non-root user on Railway's `$PORT` (default `8000`) and trusts Railway's `X-Forwarded-*` headers.
- **Migrations:** `alembic upgrade head` runs as the pre-deploy command, once per deploy before traffic moves. Containers never migrate on start-up.
- **Health check:** Railway checks `/api/health` before the new deploy goes live, and restarts the service on failure.

The web service has four variables:

| Variable | Value |
| --- | --- |
| `PORT` | `8000`, pinned so the app listens on the port the custom domain targets (Railway's default became `8080` after the 2026-10-21 incident) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}`, a reference that Railway resolves to the private `postgres.railway.internal` URL |
| `APP_ENV` | `production` (marks the session cookie `Secure`) |
| `SITE_URL` | `https://anarodriguezespinoza.com`, used for canonical URLs, `robots.txt`, and the sitemap |

Never commit or print the database URLs. Read them through the Railway CLI or dashboard.

### What is turned off

`COGNITO_*`, `S3_SNAPSHOT_*`, and `SES_*` are unset on Railway, so:

- **Admin sign-in (`/admin`) doesn't work.** Edit content directly in the database (see [Operating the site](#operating-the-site)) and set `publicationState` to `PUBLISHED` for it to appear publicly.
- **Contact submissions are saved** to `ContactInquiry` with `notificationStatus = FAILED`, because no email is sent.
- **There is no snapshot fallback.** If the database is down, `/`, `/about`, and `/projects` still show the profile from `app/content/profile.json`, the projects section says "Projects temporarily unavailable", and the status is 503. The other public pages return the 503 "temporarily unavailable" page, and `/api/health` returns `{"status":"unavailable",...}` with HTTP 503. Live reads resume on the next request once the database is back; no restart is needed.

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

- [Project 1 submission index](docs/project-1-submission.md): the live URL, final commit, and where the evidence for each requirement lives.
- [Design spec](docs/superpowers/specs/2026-09-15-personal-resume-career-platform-design.md) and plans: [app build](docs/superpowers/plans/2026-09-17-personal-resume-career-platform.md), [Azure VM migration](docs/superpowers/plans/2026-09-24-azure-vm-migration.md), [operate the VM](docs/superpowers/plans/2026-10-01-operate-the-vm.md), [Railway + PostgreSQL migration](docs/superpowers/plans/2026-10-08-railway-postgres-migration.md).
- Evidence: [ex03 (Azure VM)](docs/evidence/ex03.md), [ex05 (DNS investigation)](docs/evidence/ex05.md), [ex06 (email and analytics)](docs/evidence/ex06.md), [Zoho header check](docs/evidence/zoho-header-check.md), [final DNS records](docs/evidence/dns-records-final.md), [HTTPS checks](docs/evidence/https-checks.md), [encryption on the VM](docs/evidence/encryption.md), [how this site is secured](docs/how-this-site-is-secured.md).
- Diagrams: [request paths for Azure and Railway, with email and analytics](docs/diagrams/request-path.md) ([Railway PNG](docs/diagrams/request-path-railway.png), [Azure PNG](docs/diagrams/request-path-azure.png)), [system architecture](docs/diagrams/system-architecture.mmd), [data model](docs/diagrams/data-model.mmd).
- [System architecture](docs/architecture.md): request paths, fallback behavior, health contract, and security boundaries.
- [Database and privacy model](docs/database.md): models, publication states, public projection, inquiries, and migrations.
- [Deployment and recovery](docs/deployment.md): the Railway configuration, release migrations, health verification, and the AWS recovery commands.
- [Glossary](docs/glossary.md): shared platform terminology.

## Decisions

| Decision | Chosen | Alternatives considered | Why |
| --- | --- | --- | --- |
| First database engine | **SQLite**, one file (`data.db`) on the Azure VM's disk | PostgreSQL on the same VM; Azure Database for PostgreSQL | One VM, one process, mostly reads: SQLite needed no extra server to install, secure, patch, or pay for, and the app reads it with no network hop. The costs I accepted: one writer at a time, data tied to that VM's disk, backups by copying the file. Those costs are what the Railway move later addressed |
| Move hosting to Railway | **Railway** web service + Railway PostgreSQL | Keep the VM and add Postgres to it; Azure App Service + Azure Database for PostgreSQL; Render or Fly.io | On the VM I owned the OS, patches, Nginx, certbot, systemd, the firewall, and backups. Railway builds the Dockerfile on every push to `main`, runs migrations before traffic moves, health-checks, restarts, and terminates TLS, so I only own the code, config, and data. Managed Postgres removes the single-file, single-writer limits. Azure's managed equivalents would cost more of the student credit for the same result |
| Email | **Managed: Zoho Mail** (free plan) | Self-hosted Postfix/Dovecot on the VM; Google Workspace; Cloudflare Email Routing | Self-hosting means running SMTP, spam filtering, DKIM signing, TLS, and storage myself, and Azure blocks outbound port 25 on most subscriptions, including student ones. A new VM IP also has no sending reputation, so mail would likely land in spam. Google Workspace does the same job but is paid. Cloudflare Email Routing only forwards, it can't send as the domain. Zoho gives a real mailbox that sends and receives as `ana@anarodriguezespinoza.com` for free, and SPF, DKIM, and DMARC pass |
| Profile while the database is down | A version-controlled `app/content/profile.json` | Hard-coded template text; a full snapshot store (the S3 code exists but isn't configured on Railway) | The profile stays visible during an outage without inventing text. The file holds only facts that are already public on the resume page (name, headline, summary, education, links), so it never exposes drafts or inquiries |

## Migration: Azure VM to Railway

**What moved (2026-10-08):** the app moved from `uvicorn` under systemd behind Nginx on `vm-career-platform` (SQLite) to a Railway service built from the `Dockerfile` (PostgreSQL 18). The full step log is in the [migration plan](docs/superpowers/plans/2026-10-08-railway-postgres-migration.md).

**How current data was preserved:**

1. The schema was created on Postgres by Railway's pre-deploy `alembic upgrade head`, the same migration the VM used.
2. The VM app was stopped so no new inquiry could land in SQLite, and `data.db` was copied to my laptop.
3. `python -m app.copy_database` copied every model table into the empty Postgres database in one transaction. It converted the Prisma-era formats: one inquiry stored its timestamps as integer milliseconds, five as text, and booleans as 0/1. It refuses a non-empty target, so it can't half-copy twice.
4. The source held 6 contact inquiries and no content rows. `python -m app.compare_databases` compares source and target row by row, by primary key and every column, and prints counts only. That proves the six inquiries arrived unchanged, which a re-seed can't fake because the seed creates no inquiries.
5. The VM's `data.db` is untouched (last modified 2026-10-06) and stays as the rollback copy.

**Who is responsible for what:**

| Layer | Azure VM | Railway |
| --- | --- | --- |
| Operating system | **Me**: Ubuntu updates, reboots, disk | Railway (container host) |
| Runtime | **Me**: Python and `uv` installed on the VM | **Me** in the `Dockerfile` (`python:3.13-slim`); Railway builds and runs it |
| Entry point / process supervision | **Me**: systemd unit, `Restart=on-failure`, `--workers 2`, `enable` for boot | Railway runs the image's `CMD` and applies `restartPolicyType: ON_FAILURE` from `railway.json` |
| Network entry and firewall | **Me**: NSG rules (22 from my IP, 80, 443) and Nginx on 80/443 | Railway's edge; there's no firewall for me to manage |
| TLS | **Me**: certbot, Let's Encrypt certificate on Nginx, renewal timer | Railway issues and renews the certificate for the verified custom domain |
| Code | **Me**: `git pull` on the VM, restart the service | **Me**: push to `main`; Railway builds and deploys automatically |
| Configuration | **Me**: `.env` file on the VM read by `EnvironmentFile=` | **Me**: Railway service variables (`DATABASE_URL` reference, `APP_ENV`, `SITE_URL`) |
| Database software | **Me**: SQLite library, file permissions | Railway runs PostgreSQL 18 (version, process, storage) |
| Data | **Me**: the `data.db` file and any copies | **Me**: rows, migrations, backups/exports. Railway stores them |
| DNS | **Me** in Cloudflare: `A @ → 9.205.26.169` | **Me** in Cloudflare: `CNAME @ → Railway`, `_railway-verify` TXT, `www` redirect |

## Rollback

### Code

- **Fast:** Railway dashboard → service → **Deployments** → open the last good deployment → **Redeploy**. Railway runs the old image again, after its pre-deploy migration (a no-op if the schema is already at head).
- **Lasting:** `git revert <bad-sha>` → run `ruff` and `pytest` locally → push to `main`. This keeps `main` equal to what's live, so the next push doesn't bring the bad change back. Confirm the new deployment ID with `railway deployment list`, then check `/api/health` and the page the change touched.

### Database changes

- **Before any risky data or schema change,** take a dump: `railway run --service Postgres -- sh -c 'pg_dump "$DATABASE_PUBLIC_URL" -Fc -f ~/career-platform-backups/$(date +%F-%H%M).dump'` (outside the repo; the URL is never printed).
- **Undo a schema migration:** `alembic downgrade -1` against the database only if that migration's `downgrade()` is safe for the data in it. Otherwise ship a new forward migration that fixes it.
- **Undo a data change:** restore the affected table(s) from the dump, e.g. `pg_restore --clean --if-exists -t '"Project"' -d "$DATABASE_PUBLIC_URL" <file>.dump`.

### Back to the Azure VM, including writes made after cutover

Since 2026-10-08 new contact inquiries are written only to Railway Postgres. The VM's `data.db` doesn't have them, so pointing DNS back at the VM alone would silently drop them. To roll back without losing them:

1. **Freeze writes on Railway:** in the Railway dashboard, scale the web service to 0 replicas, or remove its deployment, so no new inquiry is accepted.
2. **Export everything from Postgres into a fresh SQLite file** (laptop):
   ```bash
   DATABASE_URL=sqlite:///$HOME/career-platform-cutover/rollback.db alembic upgrade head
   SOURCE="$(railway variables --service Postgres --kv | sed -n 's/^DATABASE_PUBLIC_URL=//p')"
   python -m app.copy_database "$SOURCE" "sqlite:///$HOME/career-platform-cutover/rollback.db"
   python -m app.compare_databases "$SOURCE" "sqlite:///$HOME/career-platform-cutover/rollback.db"   # expect 0 changed, 0 missing
   unset SOURCE
   ```
   Postgres holds the original 6 inquiries plus everything written after cutover, so the new file is a superset of the VM's.
3. **Swap it in on the VM:** `scp` it to the VM, then `sudo systemctl stop career-platform`, `mv data.db data.db.pre-rollback`, `mv rollback.db data.db`, `sudo systemctl start career-platform`, and check `/projects` and `/api/health` with `curl --resolve anarodriguezespinoza.com:443:9.205.26.169 https://anarodriguezespinoza.com/...`.
4. **Point DNS back:** in Cloudflare replace `CNAME @ → jf53ce39.up.railway.app` with `A @ → 9.205.26.169`, DNS only. The VM's Let's Encrypt certificate covers `anarodriguezespinoza.com` and `www` until 2027-01-04, and certbot can renew it again once the domain resolves to the VM. `www` keeps redirecting to the root. Allow for the 300-second TTL.
5. Set `SITE_URL=https://anarodriguezespinoza.com` in the VM's `.env` and restart the service.

## Investigated failures

- **Port 8000 unreachable on the Azure VM (real):** [ex03 §3](docs/evidence/ex03.md#3-what-went-wrong), written as symptom → checks → diagnosis → repair → re-check. The NSG had no rule for 8000, so Azure silently dropped the packets. The same cause came back on 2026-10-21, when SSH timed out after my laptop's IP changed ([operate-the-vm §4.0](docs/superpowers/plans/2026-10-01-operate-the-vm.md)).
- **Custom domain reaching the old VM (simulated lab failure):** [ex05](docs/evidence/ex05.md) is a **simulated** exercise on `site.lab.example`, not this site. A stale A record sent clients to the old VM, which caused a certificate-name mismatch. I diagnosed DNS as the first fault and the TLS error as its consequence.
- **Live site returning 502 (real, 2026-10-21 to 2026-10-25, Railway incident plus a port mismatch, fixed):**
  - *Symptom:* `https://anarodriguezespinoza.com/` returned `HTTP/2 502`, `server: railway-hikari`, body `"Application failed to respond"`. `/api/health` returned the same.
  - *Checks:* DNS was correct (`CNAME @ → jf53ce39.up.railway.app`, resolving to `69.46.46.19`). TLS was correct (Railway's Let's Encrypt certificate for `anarodriguezespinoza.com` verified, valid until 2027-01-06). So the request reached Railway's edge and the edge had no healthy app to forward it to. `railway status` failed with `Your saved login is no longer valid (grant request is invalid)`, so the CLI couldn't read logs. Railway's status page showed a **Major Outage**: Builds in every region and the API (`backboard.railway.com`) down, with a security notice and guides recommending, among other things, rotating PostgreSQL credentials and reconnecting GitHub after a credential reset.
  - *Diagnosis:* a Railway platform incident, not a fault in this app or its DNS. The invalidated CLI login fits Railway's credential reset.
  - *What I checked on my side:* the GitHub repository has no deploy keys, webhooks, or Actions secrets, I'm the only collaborator, and every recent push and branch event is mine. This app's Railway service has no third-party API keys (no OpenAI, Anthropic, Stripe, or AWS variables), so the only Railway-held secret that matters is the Postgres password.
  - *Repair (when Railway builds are back):* the steps are in the [migration plan, "Recovering from the Railway incident"](docs/superpowers/plans/2026-10-08-railway-postgres-migration.md#recovering-from-the-railway-incident-2026-10-21). In short: log in again, reconnect GitHub, rotate the Postgres password, redeploy, then re-run the HTTPS checks.
  - *Repair (2026-10-25):* logged in again and rotated the Postgres password with **Regenerate** (public access was already off). The site still returned `502` after the redeploy. The deploy logs showed Uvicorn on port `8080`, but the custom domain targets `8000`: the Dockerfile uses `${PORT:-8000}` and Railway now sets `PORT=8080`. Pinning `PORT=8000` on the web service and redeploying fixed it (deployment `ac5a2f78`).
  - *Re-check (2026-10-25):* `/` → `200`; `/api/health` → `{"status":"ok","database":"up","publicSource":"database"}`, so the app connects with the new password; no `authentication failed` in the Postgres or deploy logs.
- **`www` serving the old Azure copy (real, fixed 2026-10-21):** `www` was a DNS-only A record to the VM, so `https://www…` returned the VM's site instead of the root. Switching the record to proxied let the existing Cloudflare redirect rule answer it ([https-checks.md](docs/evidence/https-checks.md)).

## Remaining limitations

- Admin sign-in, contact-email notifications, and the S3 snapshot fallback are off on Railway (see [What is turned off](#what-is-turned-off)). Content is edited directly in the database.
- During a database outage only the profile and a notice are shown. Experience, skills, resume, and project detail pages return 503.
- The CI `e2e` job fails on every push because its Cognito test secrets don't exist. The `app` job, including the Postgres tests, passes.
- DMARC is `p=none` (report only). It should move to `quarantine` once the aggregate reports stay clean.
- The VM still holds the 6 contact inquiries in `data.db` and serves its own copy of the site at `9.205.26.169`. That's needed for the Azure requirement and for rollback, but it is a second copy of personal data to delete at cleanup.
- Railway Postgres's public TCP proxy, used for the copy, should be turned off when it's no longer needed for comparisons or rollback.

## Reflection

It was helpful to run the site on an azure virtual machine first because it allowed me to understand and experience the many responsibilities of managing a platform end-to-end. I had to set up the inbound port rules and set it up in a way to keep the site running after a reboot, configure Nginx, and set up automatic certificate renewal. After moving the site to Railway, most of these tasks were taken care of by the platform, which simplified everything and made it much easier to deploy code without worrying about updating a port rule. 

It was really helpful to have a migration plan because it helped me understand which responsibilities I still had to manage, including the code, configuration, data, and DNS.

The most challenging part of the migration was transferring the data. The SQLite database contained different information that could’ve been seen as contradictory. A simple copy of it could have caused errors or resulted in lost data, and recreating the database with new entries would not have preserved the original information. Therefore, I created a copy tool and tested it to make sure the transfer worked correctly. I also compared the records individually to confirm that the data had transferred successfully.

Another important lesson was to always verify results even if AI says everything passes. Sometimes Claude would mark tests as passed even when they were not working correctly. When it ran checks for, the /api/health endpoint, it also passed its checks even when other pages could still fail. Another case was when the www domain loaded successfully, but it was connected to the wrong server, so that had to be updated. Seeing this happen taught me to make a record of the exact command that was run, its output, and the date of everything that gets implemented or changed. Another takeaway is that its ok to mark results as unverified when I do not have enough evidence to confirm them.

## Costs, credits, and cleanup

| Service | Plan / credit | Cost so far | Expires | Cleanup |
| --- | --- | --- | --- | --- |
| Azure (`vm-career-platform`, `Standard_B2ats_v2`, Denmark East: VM, OS disk, public IP, NSG, VNet) | Azure for Students: $100 credit granted 2026-09-17 | **$5.20** for October 2026 so far (Virtual Network $3.00, Storage $2.20, bandwidth < $0.01; forecast $6.42 for the month), all in `rg-career-platform` (Cost Management, 2026-10-25). Credit balance $99.94 billed, **$95.87 estimated** including unbilled usage (billing API `credits/balanceSummary`, 2026-10-25) | Credit expires **2027-09-17**. At about $6/month it would run out in about 15 months, so the expiry date comes first | After grading: copy `data.db` off the VM (it holds the 6 original inquiries), then `az group delete -n rg-career-platform`. Deallocating alone stops compute billing, but the disk and public IP (most of the current cost) keep billing |
| Railway (web service + Postgres) | Trial workspace, $5 credit | **$0.85** project cost as of 2026-10-25 (memory $0.83, CPU $0.02, volume $0.01, egress $0.0005); $4.15 credit left | **About 2026-11-07** (13 days remaining on 2026-10-25), or earlier if the credit runs out. At about $0.05/day the credit would last months, so the date is the real limit. When the trial ends, Railway shuts the deployments down | Before 2026-11-07: either upgrade to a paid plan, or take a `pg_dump` of the database (it holds visitor inquiries, so store it privately), point DNS back to Azure using the [rollback steps](#back-to-the-azure-vm-including-writes-made-after-cutover) if the site must stay up, then delete the Railway project |
| Cloudflare (DNS, `www` redirect) | Free | $0 | n/a | Keep while the domain is used |
| Domain `anarodriguezespinoza.com` | Namecheap (registrar); DNS hosted on Cloudflare | **$6.99** for the first year ($6.79 promo registration + $0.20 ICANN fee; WhoisGuard privacy $0.00), from the Namecheap order | Registered 2026-10-01, expires **2027-10-01** (`whois`, 2026-10-25). Renewal is **$18.48/year** at today's price, $19.98 at Namecheap's upcoming price, almost 3× the first year | Decide before 2027-10-01: keep auto-renew if the site stays up, otherwise turn it off in Namecheap. Email on the domain stops working when it lapses |
| Zoho Mail | Free plan (5 GB) | $0 | n/a | Keep, or remove MX/SPF/DKIM/DMARC before deleting the mailbox |
| Google Analytics 4 | Free | $0 | n/a | Delete the property if no longer needed |

## AWS infrastructure (not currently deployed)

`infra/` defines an AWS alternative with CDK: RDS PostgreSQL, the S3 snapshot bucket, Cognito, SES, and CloudWatch logs. It is kept for reference and CI still synthesizes it, but the live site does not use it. Synthesize it with an explicit environment and a verified SES sender:

```bash
npm ci --prefix infra
npm run build --prefix infra
cd infra && npx cdk synth -c environment=development -c sesFromEmail=verified@example.com && cd ..
```

See [Deployment and recovery](docs/deployment.md) for the full AWS deploy, migration, and recovery procedure.
