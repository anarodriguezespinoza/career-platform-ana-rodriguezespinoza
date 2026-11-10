# Migration notes: Railway → AWS (EC2 + RDS)

A running log of the move, following the course guide
(`LMU-ISBA/isba-4775-fa26`, `guides/aws-migration.md`) and the plan in
`docs/superpowers/plans/2026-11-03-aws-ec2-rds-migration.md`. Every deviation
from the guide or the plan is logged below with its reason. No secrets, URLs
with passwords, or database exports go in this file.

## Decision

I chose **EC2 + Single-AZ RDS** over EC2 with local PostgreSQL because I want
to learn AWS and not run the database myself, and I accept a second service
to pay for (about $28/month, from AWS's public price files on 2026-11-03) and
to secure.

## What exists on AWS (account <account-id>, us-east-1, profile `isba-4775`)

| Resource | ID / name | Notes |
| --- | --- | --- |
| EC2 instance | `i-05f540ebfbfdebb11` (`career-platform-production`) | Ubuntu Server 26.04.1 LTS (`ami-0547ecbf0e9b4aeb5`, Canonical), t3.micro, us-east-1a, 20 GB gp3 encrypted, IMDSv2 required (hop limit 1), standard CPU credits |
| Elastic IP | `3.227.143.37` (`eipalloc-0f71d0d557be8e93c`) | Attached to the instance |
| RDS | `career-platform-production` | PostgreSQL 18.6, db.t3.micro, Single-AZ us-east-1a, 20 GB gp3 encrypted, not public, deletion protection, 1-day backups |
| Security group | `career-platform-web` `sg-08d1de93cda5898df` | 80 and 443 from anywhere; 22 from my current IP only |
| Security group | `career-platform-db` `sg-0988aa1f6c5befb78` | 5432 from `career-platform-web` only |
| DB subnet group | `career-platform-production` | Default-VPC subnets in us-east-1a, b, c, d, f |
| Key pair | `career-platform-production` | Imported from my laptop; the private key never left it |

The RDS master password is in `~/career-platform-cutover/aws/` on my laptop
(mode 600), outside the repository.

## Log

### 2026-10-29: Backup and restore drill (guide §2)

- Two `pg_dump -Fc` backups of Railway (PostgreSQL 18.6): one over the public
  URL, one through `railway run`. Both are in `~/career-platform-cutover/`,
  outside the repository.
- Each was restored into a new, throwaway local PostgreSQL 18 database. The
  restores used `--no-owner --no-acl --exit-on-error` and ran as a non-`postgres`
  role. `app.compare_databases` matched 23 of 23 rows across 7 tables against
  Railway, and the app ran on the restored copy (`/api/health` up, public pages 200).
- The restore time was not measured; for a 17.5 KB dump it took a few seconds.

### 2026-11-03: RDS (guide §7)

- **Deviation: backups are kept for 1 day, not 7.** `create-db-instance` failed
  with `FreeTierRestrictionError` for every value from 7 down to 2. The account
  is on the AWS Free plan, which caps automated backup retention at 1 day.
  Longer history will come from nightly `pg_dump` exports kept off AWS.
- Pinned to us-east-1a so the instance can sit in the same zone; traffic
  between zones would be billed.

### 2026-11-03: First instance (guide §8), since replaced

- Launched Amazon Linux 2023 with Docker + Caddy, following my earlier plan.
- **Deviation: the SSH host key was not checked** against the console output
  before the first connection (`StrictHostKeyChecking=accept-new`). Nothing
  was deployed on it, and it has now been terminated.

### 2026-11-09: Instance replaced to match the guide (guide §8)

- **Deviation from the plan:** the plan's Amazon Linux + Docker + Caddy setup
  is replaced by the guide's **Ubuntu 26.04 LTS** with the app as a systemd
  service behind **Nginx + certbot**. This way the guide's §9–10 checks and the
  VM guide's `systemctl` and Nginx checks apply as written, and Ubuntu ships
  the PostgreSQL 18 client for the restore.
- Launched `i-05f540ebfbfdebb11` with the same subnet, security group, key, and
  launch settings. Moved the Elastic IP to it before terminating the old,
  empty instance `i-0b7352490b62bb783`, so the address never sat idle. The old
  root volume was deleted with it.
- **Host key verified:** all three fingerprints (ED25519, ECDSA, RSA) from
  `aws ec2 get-console-output` matched `ssh-keyscan` before I connected. Only
  those keys were added to `known_hosts`.
- My public IP changed, so the SSH rule now allows only the new `/32`.
- Checks on the new server: Ubuntu 26.04.1 LTS, x86_64, unattended-upgrades
  enabled, IMDS without a token returns 401, `postgresql-client-18` 18.6 and
  `nginx` 1.28 available from apt.

### 2026-11-09: Deploy and restore (guide §9)

Done one phase at a time over SSH. Railway and its DNS were not changed.

1. **Packages:** ran `apt-get upgrade`, then installed `nginx` 1.28.3, `certbot` 4.0.0 with
   `python3-certbot-nginx`, `postgresql-client-18` 18.6, and `python3-venv`
   (Python 3.14.4). Added a 1 GiB swap file, because the instance has about
   900 MB of RAM. No reboot was required. Nginx was not on this instance
   before; it came from a fresh Canonical image, and the Azure VM's setup
   doesn't carry over.
2. **App:**
   - Created the system user `career-platform` (no login shell).
   - Copied the code from commit `2ab5b11` (`git archive`, the same app code as
     `main`) to `/opt/career-platform/app`. The commit is recorded in
     `/opt/career-platform/REVISION`.
   - Built a root-owned virtualenv in `/opt/career-platform/venv`, so the
     service can run the code but not change it.
   - Downloaded the RDS CA bundle to
     `/etc/career-platform/rds-global-bundle.pem`.
3. **Database role:** as `postgres_admin`, created the login role
   `career_app` and made it the owner of the `career_platform` database and
   its `public` schema. The app never uses the admin account. Both passwords
   are in `~/career-platform-cutover/aws/` on my laptop and were sent to the
   server only over SSH stdin. The connection used TLS 1.3 with
   `sslmode=verify-full`.
4. **App config:** `/etc/career-platform/app.env` (root, mode 600) holds
   `DATABASE_URL` (as `career_app`, `verify-full`), `APP_ENV=production`,
   and `SITE_URL=https://anarodriguezespinoza.com`. No Cognito, S3, or SES
   settings, the same as Railway.
5. **Restore before migrations**, as the guide says:
   - Took a fresh dump through `railway run`:
     `railway-20261110T062329Z-aws-rehearsal.dump`, 18,257 bytes, SHA-256
     starting `e01feacebec89cc9`.
   - Copied it to the instance (mode 600). Checked that the database had 0
     tables, then restored it with
     `pg_restore --no-owner --no-acl --exit-on-error` as `career_app`. The
     restore took **2 s**, and the dump was deleted from the instance afterwards.
   - Result: Alembic version `0001`, and `career_app` owns all 8 tables.
   - `app.compare_databases` against live Railway (exit 0):

     ```text
     table | source | target | matched | changed | missing | extra
     ContactInquiry | 14 | 14 | 14 | 0 | 0 | 0
     Experience | 3 | 3 | 3 | 0 | 0 | 0
     Profile | 1 | 1 | 1 | 0 | 0 | 0
     Project | 1 | 1 | 1 | 0 | 0 | 0
     ResumeSettings | 1 | 1 | 1 | 0 | 0 | 0
     Skill | 3 | 3 | 3 | 0 | 0 | 0
     ProjectTechnology | 3 | 3 | 3 | 0 | 0 | 0
     ```

6. **Release migration:** `alembic upgrade head` ran once as `career-platform`
   through `systemd-run` with the same env file. A shell `source` would break
   on the `&` in the URL. It had nothing to apply (`0001 (head)`). No seed
   script and no Azure deploy script were run.
7. **Service and front door:**
   - `deploy/aws/career-platform.service` is installed as the systemd unit
     `career-platform`, enabled and active. Uvicorn listens on
     `127.0.0.1:8000` only and trusts forwarded headers from `127.0.0.1` only.
     The unit uses `ProtectSystem=strict`; the app writes no files.
   - `deploy/aws/nginx-career-platform.conf` is the Nginx site on port 80 for
     `aws.anarodriguezespinoza.com` and `anarodriguezespinoza.com`. The
     default site is removed.
8. **Checks:**
   - **Over the internet:** from my laptop to `http://3.227.143.37` with
     `Host: aws.anarodriguezespinoza.com`, before DNS:
     - `/api/health` returns `{"status":"ok","database":"up","publicSource":"database"}`.
     - `/`, `/about`, `/projects`, `/skills`, `/experience`, `/resume`,
       `/contact`, and `/privacy` all return 200. `/skills` shows the rows
       restored from Railway.
     - `/api/resume` returns the same PDF as Railway (200, `application/pdf`,
       3,559 bytes), and an unknown path returns the same 404 as Railway.
     - Port 8000 is closed from the internet.
   - **Restart and crash** (VM guide §6): `systemctl restart` comes back
     `active`. After `kill -9` on Uvicorn, systemd restarted it in under 5 s
     (`NRestarts=1`) and health was `ok` again. `journalctl -u career-platform`
     shows clean startups.
   - **Not yet tested:** HTTPS (§10), submitting the contact form (it would
     add a row Railway doesn't have; I'll test it on the test subdomain), and
     a full instance reboot.

### 2026-11-09: Test subdomain and HTTPS (guide §10)

- **DNS:** I added `A aws → 3.227.143.37` (DNS only, grey cloud) in the
  Cloudflare dashboard instead of the Cloudflare CLI, which isn't installed
  on this laptop. `nslookup`, `1.1.1.1`, and `8.8.8.8` all answer
  `3.227.143.37`. The root record (Railway) and the Zoho MX records are
  unchanged, and the live site still reports `ok` from Railway.
- **Certificate:** ran
  `certbot --nginx -d aws.anarodriguezespinoza.com --redirect --agree-tos --register-unsafely-without-email`.
  The account has no email because Let's Encrypt stopped sending expiry
  emails in 2025, and the `certbot.timer` renews automatically.
  `certbot renew --dry-run` succeeded.
- **Certificate details:** `CN=aws.anarodriguezespinoza.com`, issued by Let's
  Encrypt `YE1`, valid 2026-11-10 to 2027-02-08. The root domain gets its own
  certificate at cutover.
- **Nginx:** certbot edited the site. `deploy/aws/nginx-career-platform.conf`
  is now a copy of the server's version, with the 443 server block and the
  301 redirect.
- **Checks from my laptop:** the TLS certificate verifies (`ssl_verify_result`
  0). `http://aws.…/about` returns 301 to `https://aws.…/about`. Over HTTPS,
  `/api/health` is `ok`/`up`/`database`, and `/`, `/about`, `/projects`,
  `/skills`, `/experience`, `/resume`, `/contact`, `/privacy`, and
  `/api/resume` all return 200.

### 2026-11-10: Full test pass on the test subdomain (guide §10)

- **Contact form:** `POST /contact` on `https://aws.anarodriguezespinoza.com`
  (type `PROJECT`) returned 303 to `https://aws…/contact?sent=1`. Inquiries
  went from 14 to 15, and the new row is `notificationStatus=FAILED`, the same
  as Railway, where SES is also unset. My first attempt returned 400 because my
  script sent an empty `opportunityType`; that was a test mistake, not an app fault.
- **Reboot:** after `systemctl reboot`, `career-platform` and `nginx` came
  back `active`, swap was on, and `/api/health` was `ok` with no manual steps.

### 2026-11-10: Cutover (guide §11)

- **Decisions:** RPO 24 hours, RTO 4 hours, cutover the same night.
- **Deviation from the plan, freezing writes:** the plan pointed Railway's
  `DATABASE_URL` at a dead address. That wouldn't have worked: Railway runs
  `alembic upgrade head` before each deploy, that step would fail, and the old
  deploy would keep running and accepting writes. Instead, as Railway's
  `postgres` superuser:
  `ALTER DATABASE railway SET default_transaction_read_only = on`, then
  `pg_terminate_backend` on the app's 2 open connections. A test
  `CREATE TABLE` failed with "read-only transaction", and Railway kept
  serving pages. **Frozen at 06:52:44 UTC.**
- **Final dump:** `railway-20261110T065245Z-final.dump`, 18,458 bytes,
  SHA-256 starting `926ae87cbd2a296d`, in `~/career-platform-cutover/`.
- **RDS rebuilt:** stopped `career-platform`. As `postgres_admin`, dropped and
  recreated `career_platform` (owner `career_app`), which removed the
  rehearsal data and my test inquiry. Restored the final dump in 2 s
  (`pg_restore` exit 0, Alembic `0001`). `compare_databases` against frozen
  Railway matched 26 of 26 rows (14 inquiries) with exit 0. `alembic upgrade
  head` had nothing to apply. Started the service, and health was `ok`.
- **DNS:** I changed the root record in Cloudflare from
  `CNAME → jf53ce39.up.railway.app` (DNS only) to
  `A → 3.227.143.37` (DNS only). **The CNAME target is the rollback value.**
  `aws`, `www` (proxied redirect), `_railway-verify`, and all Zoho records were
  left unchanged. 1.1.1.1, 8.8.8.8, and the local resolver answered
  `3.227.143.37` by 06:59:36 UTC.
- **Certificate:** `certbot --nginx --cert-name aws.anarodriguezespinoza.com
  -d aws.anarodriguezespinoza.com -d anarodriguezespinoza.com --expand
  --redirect`. One Let's Encrypt (`YE1`) certificate now covers both names,
  valid until 2027-02-08. `deploy/aws/nginx-career-platform.conf` is updated
  from the server.
- **Live checks:** `https://anarodriguezespinoza.com/api/health` returns
  `ok`/`up`/`database`, and certificate verification passes. `http://` and
  `https://www.` both return 301 to `https://anarodriguezespinoza.com/`.
  `/`, `/about`, `/projects`, `/skills`, `/experience`, `/resume`,
  `/contact`, `/privacy`, `/api/resume`, `/robots.txt`, and `/sitemap.xml`
  all return 200. `/skills` shows the RDS rows, and the instance's Nginx
  access log shows these requests, so they reach AWS, not Railway.
- **How long writes were frozen:** about 7 minutes (06:52:44 to about
  06:59:36 UTC). No inquiry was lost: the final dump was taken after the
  freeze, and every row matched.
- **Railway now:** a standby, with its database still read-only. To roll
  back, see the README's "Back to Railway" steps, which reconcile any
  inquiries written on AWS first.

## Still to do

- [x] §1–§10: done (see the log above).
- [x] §11: cutover on 2026-11-10 at about 06:59 UTC.
- [x] §1: zero-spend budget created. Billing home on 2026-11-10 shows 1 active budget, status OK, and $5.54 month-to-date, covered by Free plan credits.
- [ ] §2: put a copy of the dumps on separate storage, add a nightly
      `pg_dump`, and turn off Railway's public database access after the
      rollback period.
- [ ] §11: merge the branch into `main`, check the site, and delete the branch.
- [ ] Railway: after a few days with no rollback, shut it down. Remove
      `_railway-verify` and, when it's no longer needed, the `aws` test record.
