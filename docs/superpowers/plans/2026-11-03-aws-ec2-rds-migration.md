# AWS EC2 + RDS Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `anarodriguezespinoza.com` from Railway to AWS as its long-term home: the existing Docker image on one EC2 instance behind Caddy, backed by a Single-AZ RDS PostgreSQL 18 database, with all current data carried over.

**Architecture:** Everything is created with AWS CLI scripts in `deploy/aws/`, run from the Mac with profile `isba-4775`; there is no CloudFormation or CDK. The instance runs `docker compose` with two containers: the app (port 8000, never published) and Caddy (80/443, Let's Encrypt). RDS is private, reachable only from the instance's security group, over TLS verified against the RDS CA bundle. Data moves with `pg_dump`/`pg_restore` and is proven with `app.compare_databases`. Railway stays intact as the rollback target.

**Tech Stack:** Bash (macOS bash 3.2 compatible), AWS CLI v2.39, Amazon Linux 2023 (x86_64), Docker + Compose plugin, Caddy 2, RDS PostgreSQL 18.6, pytest (script tests with a fake `aws`/`ssh` on `PATH`).

**Spec:** No separate spec. The request: "Use EC2 for the app and a Single-AZ RDS PostgreSQL database. Work on a new branch so Railway doesn't redeploy from main. Don't create anything yet." Together with the decisions recorded 2026-11-03 (long-term home, CLI only, class account) and the findings below, it serves as the spec.

## Revision 2026-11-09: follow the course guide's server setup

The instance now runs **Ubuntu Server 26.04 LTS** (`i-05f540ebfbfdebb11`), not Amazon Linux 2023. This follows the course guide (`guides/aws-migration.md` §8–10). The changes:

- **Replaced:** Docker, Compose and Caddy (Tasks 4–6, `compose.yml`, `Caddyfile`, `user-data.sh`). Instead, the app runs from a Python virtualenv as the systemd service `career-platform` (Uvicorn on `127.0.0.1:8000`), behind **Nginx** with a **certbot** (Let's Encrypt) certificate. The SSH user is `ubuntu`.
- **Restore order:** restore the Railway dump into the **empty** database first, then run `alembic upgrade head`. The dump already contains `alembic_version`, so the migration should do nothing.
- **Restore client:** `pg_restore` and `pg_dump` come from Ubuntu's `postgresql-client-18`, not a `postgres:18` container.
- **Unchanged:** everything else (RDS, the security groups, the Elastic IP, secrets handling, the `career_app` role, `sslmode=verify-full`, privacy rules, no seed script, and the cutover with a write freeze).
- **The deviation log** is `migration-notes.md` in the repository root.

## What the inspection found (2026-11-03)

- **The app needs no code changes.** The Railway deployment runs the same `Dockerfile` with only `DATABASE_URL`, `APP_ENV`, `SITE_URL`, and `PORT`. Cognito, S3, and SES stay unset (`README.md`, "What is turned off"). The `REQUIRED_VARIABLES` in `app/config.py` are only enforced by `load_env()`, which the inquiry notifier calls. Missing ones mark the inquiry `FAILED`, which is the current behavior.
- **Source database:** Railway Postgres **18.6**, 23 rows across 7 tables (11 `ContactInquiry`). A backup and restore drill on 2026-10-29 proved `pg_restore --no-owner --no-acl --exit-on-error` plus `compare_databases` work. RDS must be **18.x**, because a dump does not restore into an older major version.
- **`compare_databases` exits 2** when any row is `changed` or `missing` (`app/compare_databases.py:84`). The cutover can gate on that exit code.
- **The Dockerfile trusts all proxy headers** (`--forwarded-allow-ips '*'`). That is safe only if port 8000 is unreachable from outside Docker's network.
- **Account limits** (`isba-student` in `<account-id>`, probed 2026-11-03):
  - Allowed: EC2 `t3.micro` and `t3.small` only (`t4g.*`, `t2.micro`, and `t3.medium` are denied); create security groups, allocate an Elastic IP, import a key pair (all dry run); EC2/RDS describe calls; `db.t3.micro` and `db.t4g.micro` are orderable for 18.6.
  - Denied: CloudFormation, IAM roles and instance profiles, SSM (including public parameters), Secrets Manager, S3, CloudWatch Logs, ACM, Route 53, SES, Budgets, Cost Explorer.
  - **Unknown: `rds:CreateDBInstance`.** RDS has no dry run, so Task 7 starts by finding out.
- **The default VPC `vpc-07781305ddfd7c7ad`** has subnets in 6 AZs. `us-east-1e` offers neither `t3.micro` nor `db.t3.micro`, so the DB subnet group uses the other five.
- **The account is on the AWS Free plan** (found 2026-11-03). `create-db-instance` returned `FreeTierRestrictionError` for any backup retention above **1 day**. Free plan accounts run on credits and close when the credits or the plan period run out, unless they're upgraded. Expect other Free plan limits to surface the same way.
- **The GitHub repo is public. Railway deploys only `main`.** Work on branch `aws-ec2-rds-migration`. Merging it later redeploys Railway with no app change, which is harmless.
- **SSH key `~/.ssh/id_ed25519.pub` exists.** There is no `shellcheck` and no Docker on the Mac. The image is built on the instance.

## Global Constraints

- **Profile, region, and account:** AWS profile `isba-4775`, region `us-east-1`. Every script aborts unless `aws sts get-caller-identity` returns account `<account-id>`.
- **Instance:** EC2 `t3.micro`, Amazon Linux 2023 x86_64 (newest `al2023-ami-2023.*-x86_64` owned by `amazon`), 20 GiB gp3 encrypted root volume, IMDSv2 required (`HttpTokens=required`), one Elastic IP, launched in **`us-east-1a`** (subnet `subnet-09c4e19d75d3bc644`), the same AZ as RDS, so app-to-database traffic is free.
- **Database:** RDS `postgres` **18.6**, `db.t3.micro`, **Single-AZ** (`--no-multi-az`), 20 GiB gp3, `--storage-encrypted`, `--no-publicly-accessible`, `--backup-retention-period 1` (the Free plan maximum; the nightly `pg_dump` files cover longer history), `--availability-zone us-east-1a`, `--deletion-protection`, `--auto-minor-version-upgrade`, database name `career_platform`.
- **Names:** every resource is named or tagged `career-platform-production` (tag `Project=career-platform`). Scripts find existing resources by that name and reuse them, never creating duplicates.
- **Security groups:** `career-platform-web` allows 80 and 443 from `0.0.0.0/0` and `::/0`, and 22 from the operator's current `/32` only. `career-platform-db` allows 5432 from `career-platform-web` only. Nothing opens 8000 or 5432 to any CIDR.
- **Secrets:**
  - **Where they live:** only in `~/career-platform-cutover/aws/` (mode `700`, files `600`) on the Mac, and in `/etc/career-platform/app.env` (mode `600`, root) on the instance.
  - **Where they never go:** git, user data, `aws` command-line arguments, or stdout.
  - **How they reach `aws`:** through a `--cli-input-json file://` temp file, mode `600`, deleted on exit.
  - **How they reach the instance:** through `ssh` stdin, never as arguments.
- **Database roles:** the app connects as role `career_app`, which owns `career_platform`. The RDS master user `postgres_admin` is used only by `bootstrap-database.sh`.
- **Database URL:** `postgresql://career_app:<pw>@<endpoint>:5432/career_platform?sslmode=verify-full&sslrootcert=/etc/career-platform/rds-global-bundle.pem`. The bundle comes from `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem`.
- **Migrations:** containers never migrate on start-up. `deploy.sh` runs `alembic upgrade head` as a one-off `docker compose run` before `up -d`.
- **Restores:** use `pg_restore --no-owner --no-acl --exit-on-error` from the `postgres:18` image. A restore refuses to run into a database that already has tables in `public`.
- **Privacy:** never print inquiry contents or any database URL. Tools print counts only.
- **Staging files:** stage by name only. Never `git add -A` or `git add .`. No Claude attribution lines in commits.
- **Bash 3.2:** scripts start with `#!/usr/bin/env bash` and `set -euo pipefail`, and avoid bash 4 features (`declare -A`, `mapfile`, `${var,,}`).
- **No AWS resources are created while executing Tasks 1–6.** Task 7 creates them, one phase at a time, after the user approves each phase.

## Review Focus

1. **Re-running a create script after a partial failure** (e.g. the security group exists but the RDS instance doesn't): it must reuse what exists and create only what's missing. Pinned in Tasks 2, 3 and 4.
2. **Wrong or expired credentials** (default profile, a different account, an expired `aws login`): every script must stop before its first mutating call. Pinned in Task 1.
3. **A secret leaking** into `aws` arguments (visible in `ps` and the CloudTrail request parameters), user data, or stdout. Pinned in Tasks 3 and 5.
4. **Port 8000 or 5432 reachable from the internet** through a security-group rule or a published compose port. Pinned in Tasks 2 and 4.
5. **Restoring into a database that already holds data** (e.g. running the cutover restore twice): it must refuse and change nothing. Pinned in Task 6.

---

## File Structure

```
deploy/aws/
  settings.env              # non-secret names/sizes; every value overridable from the environment
  lib.sh                    # sourced: load settings, aws() wrapper, require_account, find-or-create helpers, secret helpers
  preflight.sh              # read-only permission checks (dry runs); creates nothing
  create-network.sh         # security groups; re-run to refresh the SSH /32
  create-database.sh        # DB subnet group + RDS instance; waits for "available"
  create-instance.sh        # key pair import, instance with user data, Elastic IP
  bootstrap-database.sh     # career_app role + database; writes /etc/career-platform/app.env over ssh
  deploy.sh                 # ship a git ref, build, migrate, restart, health-check
  restore.sh                # copy a dump up, restore into an empty RDS, compare against a source URL
  fetch-backups.sh          # pull the instance's nightly dumps to the Mac (the off-AWS copy)
  teardown.sh               # typed-confirmation teardown (exit path for the class account)
  server/
    user-data.sh            # first boot: updates, docker+compose, swap, dnf-automatic, CA bundle; no secrets
    compose.yml             # app + caddy
    Caddyfile
    backup.sh               # nightly pg_dump on the instance, keeps 14
    career-platform-backup.service
    career-platform-backup.timer
tests/
  aws_fakes.py              # fixtures: fake aws/ssh/scp on PATH that log argv and replay canned output
  test_aws_scripts.py
docs/deployment.md          # new "AWS (EC2 + RDS)" section
docs/aws-cutover-runbook.md # the Task 7 phases as a checklist the operator follows
```

## Monthly cost (us-east-1 on-demand)

These are estimates. The account can't read its own bill, so check the course's billing view after the first week.

| Item | Rate | Monthly |
| --- | --- | --- |
| EC2 t3.micro | $0.0104/h | ≈ $7.60 |
| RDS db.t3.micro Single-AZ | $0.018/h | ≈ $13.10 |
| RDS 20 GiB gp3 storage | $0.115/GiB | ≈ $2.30 |
| EBS 20 GiB gp3 | $0.08/GiB | ≈ $1.60 |
| Public IPv4 (Elastic IP) | $0.005/h | ≈ $3.65 |
| RDS backups ≤ 20 GiB | free up to the database's size | $0 |
| **Total** | | **≈ $28** |

---

### Task 1: Script harness, settings, and preflight

**Files:**
- Create: `deploy/aws/settings.env`, `deploy/aws/lib.sh`, `deploy/aws/preflight.sh`
- Create: `tests/aws_fakes.py`, `tests/test_aws_scripts.py`

**Interfaces:**
- Produces (`tests/aws_fakes.py`):
  - `fake_cli(tmp_path, monkeypatch) -> FakeCli` fixture. It writes executable `aws`, `ssh`, `scp`, `curl` and `railway` stubs into `tmp_path/bin` and prepends that directory to `PATH`. It also sets `CAREER_SECRETS_DIR=tmp_path/secrets` and `HOME=tmp_path/home`.
  - `FakeCli.respond(prefix: list[str], stdout: str = "", exit_code: int = 0)`: the first logged call whose argv starts with `prefix` gets this output. Unmatched calls print nothing and exit 0.
  - `FakeCli.calls(tool: str = "aws") -> list[list[str]]`: the argv of each call, in order.
  - `FakeCli.stdin(tool: str) -> list[str]`: the stdin each call received.
  - `run_script(name: str, *args: str, env: dict | None = None) -> subprocess.CompletedProcess`: runs `deploy/aws/<name>` with `bash` and captures text.
- Produces (`lib.sh`, sourced by every script):
  - `aws ...`: wraps the real CLI with `--profile "$AWS_PROFILE_NAME" --region "$AWS_REGION_NAME" --output text`, unless the caller passes `--output`.
  - `require_account`: exits 3 with `Wrong AWS account or expired login (run: aws login --profile $AWS_PROFILE_NAME)` unless the `sts get-caller-identity` Account equals `$EXPECTED_ACCOUNT`.
  - `log MSG`: writes `==> MSG` to stderr.
  - `secrets_dir`: echoes `$CAREER_SECRETS_DIR`, created with mode `700`.
  - `new_secret NAME`: creates `$(secrets_dir)/NAME` (mode `600`, 32 random URL-safe characters from `openssl rand`) only if it's absent, and echoes its path.
  - `find_tagged KIND`: echoes the ID of the resource tagged `Name=$NAME_PREFIX-<kind>`, or nothing.
- `settings.env` keys, each written as `: "${KEY:=value}"`:
  - `AWS_PROFILE_NAME=isba-4775`, `AWS_REGION_NAME=us-east-1`, `EXPECTED_ACCOUNT=<account-id>`
  - `NAME_PREFIX=career-platform-production`, `VPC_ID=vpc-07781305ddfd7c7ad`
  - `INSTANCE_TYPE=t3.micro`, `DB_INSTANCE_CLASS=db.t3.micro`, `DB_ENGINE_VERSION=18.6`, `DB_STORAGE_GB=20`, `DB_BACKUP_DAYS=1`, `AVAILABILITY_ZONE=us-east-1a`
  - `DB_NAME=career_platform`, `DB_MASTER_USER=postgres_admin`, `DB_APP_USER=career_app`
  - `SITE_DOMAIN=anarodriguezespinoza.com`, `TEST_DOMAIN=aws.anarodriguezespinoza.com`
  - `SSH_PUBLIC_KEY=$HOME/.ssh/id_ed25519.pub`, `SSH_USER=ec2-user`
  - `CAREER_SECRETS_DIR=$HOME/career-platform-cutover/aws`

- [ ] **Step 1: Write the failing tests**

```python
def test_every_script_stops_on_wrong_account(fake_cli):
    fake_cli.respond(["sts", "get-caller-identity"], "111111111111")
    for name in ["preflight.sh", "create-network.sh", "create-database.sh", "create-instance.sh", "teardown.sh"]:
        result = run_script(name)
        assert result.returncode == 3, name
        assert "aws login --profile isba-4775" in result.stderr
    mutating = [c for c in fake_cli.calls() if c[1].startswith(("create", "run", "allocate", "import", "authorize", "delete", "modify"))]
    assert mutating == []

def test_aws_wrapper_always_pins_profile_and_region(fake_cli):
    fake_cli.respond(["sts", "get-caller-identity"], "<account-id>")
    run_script("preflight.sh")
    assert all({"--profile", "isba-4775", "--region", "us-east-1"} <= set(c) for c in fake_cli.calls())

def test_preflight_reports_each_check_and_never_mutates(fake_cli):
    fake_cli.respond(["sts", "get-caller-identity"], "<account-id>")
    fake_cli.respond(["ec2", "run-instances"], "An error occurred (DryRunOperation)", exit_code=254)
    fake_cli.respond(["ec2", "import-key-pair"], "An error occurred (UnauthorizedOperation)", exit_code=254)
    result = run_script("preflight.sh")
    assert "PASS  ec2:RunInstances t3.micro" in result.stdout
    assert "FAIL  ec2:ImportKeyPair" in result.stdout
    assert "UNKNOWN  rds:CreateDBInstance (no dry run; Task 7 phase 2 finds out)" in result.stdout
    assert result.returncode == 1
    assert all("--dry-run" in c for c in fake_cli.calls() if c[:2] in (["ec2", "run-instances"], ["ec2", "import-key-pair"], ["ec2", "create-security-group"], ["ec2", "allocate-address"]))
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `.venv/bin/pytest tests/test_aws_scripts.py -v`
Expected: FAIL, because the scripts don't exist yet.

- [ ] **Step 3: Implement `settings.env`, `lib.sh`, and `preflight.sh`**

`preflight.sh` dry-runs these and prints `PASS  <check>` or `FAIL  <check>` for each:
- `run-instances` with `t3.micro`
- `import-key-pair`
- `create-security-group`
- `allocate-address`
- `describe-orderable-db-instance-options` for `$DB_INSTANCE_CLASS` and `$DB_ENGINE_VERSION`

A dry run passes when the output contains `DryRunOperation`. The script also prints the `UNKNOWN` line for RDS, and exits 1 if any check fails. Find the AMI with `ec2 describe-images --owners amazon`, because the SSM public parameter is denied in this account.

Create stubs for the four not-yet-written create and teardown scripts. Each sources `lib.sh` and calls `require_account`, so the first test can pass. Later tasks fill them in.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `.venv/bin/pytest tests/test_aws_scripts.py -v && bash -n deploy/aws/*.sh`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deploy/aws/settings.env deploy/aws/lib.sh deploy/aws/preflight.sh deploy/aws/create-network.sh deploy/aws/create-database.sh deploy/aws/create-instance.sh deploy/aws/teardown.sh tests/aws_fakes.py tests/test_aws_scripts.py
git commit -m "feat(aws): add CLI script harness and read-only preflight"
```

### Task 2: Security groups

**Files:**
- Modify: `deploy/aws/create-network.sh`
- Test: `tests/test_aws_scripts.py`

**Interfaces:**
- Consumes: `aws`, `require_account`, and `log` from Task 1.
- Produces: `create-network.sh` prints `WEB_SG=sg-…` and `DB_SG=sg-…` on stdout, one per line. It finds groups by `group-name` in `$VPC_ID` (`career-platform-web` and `career-platform-db`). The operator IP comes from `curl -fsS https://checkip.amazonaws.com`.

- [ ] **Step 1: Write the failing tests**

```python
def test_network_opens_only_web_ports_publicly(fake_cli):
    # stubs: account ok, no existing groups, create returns ids, checkip returns 203.0.113.7
    run_script("create-network.sh")
    rules = [c for c in fake_cli.calls() if c[:2] == ["ec2", "authorize-security-group-ingress"]]
    public = [r for r in rules if "0.0.0.0/0" in " ".join(r) or "::/0" in " ".join(r)]
    assert sorted(port_of(r) for r in public) == [80, 80, 443, 443]
    assert any(port_of(r) == 22 and "203.0.113.7/32" in " ".join(r) for r in rules)
    db_rule = [r for r in rules if port_of(r) == 5432]
    assert len(db_rule) == 1 and "sg-web" in " ".join(db_rule[0]) and "0.0.0.0/0" not in " ".join(db_rule[0])
    assert not any(port_of(r) == 8000 for r in rules)

def test_network_rerun_reuses_groups_and_replaces_ssh_ip(fake_cli):
    # stubs: both groups already exist; the existing 22 rule is from 198.51.100.4/32; checkip returns 203.0.113.7
    run_script("create-network.sh")
    assert not [c for c in fake_cli.calls() if c[:2] == ["ec2", "create-security-group"]]
    assert any(c[:2] == ["ec2", "revoke-security-group-ingress"] and "198.51.100.4/32" in " ".join(c) for c in fake_cli.calls())
```

`port_of(argv) -> int` is a helper in `tests/aws_fakes.py`. It reads `--port`, or `FromPort` from an `--ip-permissions` JSON.

- [ ] **Step 2: Run the tests and confirm they fail.** Run: `.venv/bin/pytest tests/test_aws_scripts.py -k network -v`. Expected: FAIL.
- [ ] **Step 3: Implement `create-network.sh`.** Create each group only if it's missing, and add each rule only if it's absent. On every run, revoke any port-22 rule whose CIDR differs from the current `/32`.
- [ ] **Step 4: Run the tests and confirm they pass.** Run: `.venv/bin/pytest tests/test_aws_scripts.py -v`. Expected: PASS.
- [ ] **Step 5: Commit.** Run `git add deploy/aws/create-network.sh tests/aws_fakes.py tests/test_aws_scripts.py && git commit -m "feat(aws): create web and database security groups"`.

### Task 3: RDS database

**Files:**
- Modify: `deploy/aws/create-database.sh`
- Test: `tests/test_aws_scripts.py`

**Interfaces:**
- Consumes: `new_secret` from Task 1. It reads `DB_SG` by looking the group up by name, as Task 2's script does, not from that script's output.
- Produces:
  - The master password file `$(secrets_dir)/rds-master-password`.
  - DB subnet group `career-platform-production`, built from every default-VPC subnet.
  - DB instance `career-platform-production`.
  - On stdout: `DB_ENDPOINT=<address>`.

- [ ] **Step 1: Write the failing tests**

```python
def test_database_is_single_az_private_encrypted_pg18(fake_cli):
    run_script("create-database.sh")  # stubs: no instance exists yet
    create = only_call(fake_cli, ["rds", "create-db-instance"])
    spec = cli_input_json(create)  # parses the file:// JSON the script passed
    assert spec["Engine"] == "postgres" and spec["EngineVersion"] == "18.6"
    assert spec["DBInstanceClass"] == "db.t3.micro" and spec["MultiAZ"] is False
    assert spec["PubliclyAccessible"] is False and spec["StorageEncrypted"] is True
    assert spec["StorageType"] == "gp3" and spec["AllocatedStorage"] == 20
    assert spec["BackupRetentionPeriod"] == 1 and spec["DeletionProtection"] is True
    assert spec["DBName"] == "career_platform" and spec["MasterUsername"] == "postgres_admin"

def test_database_password_never_in_argv_or_stdout(fake_cli):
    result = run_script("create-database.sh")
    password = (fake_cli.secrets / "rds-master-password").read_text().strip()
    assert all(password not in " ".join(c) for c in fake_cli.calls())
    assert password not in result.stdout + result.stderr
    assert oct((fake_cli.secrets / "rds-master-password").stat().st_mode)[-3:] == "600"

def test_database_rerun_does_not_recreate(fake_cli):
    # stubs: describe-db-instances returns status "available" and an endpoint
    result = run_script("create-database.sh")
    assert not [c for c in fake_cli.calls() if c[:2] == ["rds", "create-db-instance"]]
    assert "DB_ENDPOINT=" in result.stdout
```

`cli_input_json` reads the temp file while the stub runs, because the script deletes it on exit. The `aws` stub copies any `file://` argument into the log directory.

- [ ] **Step 2: Run the tests and confirm they fail.** Run: `.venv/bin/pytest tests/test_aws_scripts.py -k database -v`. Expected: FAIL.
- [ ] **Step 3: Implement `create-database.sh`.**
  - Build the `create-db-instance` JSON in a `mktemp` file with `umask 077` and `trap 'rm -f "$tmp"' EXIT`.
  - Then run `aws rds wait db-instance-available`.
  - If the call fails with `AccessDenied` or `not authorized`, print `RDS creation is not permitted for this user. Stop and ask the instructor.` and exit 4.
- [ ] **Step 4: Run the tests and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** Run `git add deploy/aws/create-database.sh tests/aws_fakes.py tests/test_aws_scripts.py && git commit -m "feat(aws): create Single-AZ RDS PostgreSQL 18"`.

### Task 4: Instance, first-boot setup, and server files

**Files:**
- Modify: `deploy/aws/create-instance.sh`
- Create: `deploy/aws/server/user-data.sh`, `deploy/aws/server/compose.yml`, `deploy/aws/server/Caddyfile`
- Test: `tests/test_aws_scripts.py`

**Interfaces:**
- Consumes: the `career-platform-web` group from Task 2, and `SSH_PUBLIC_KEY` from settings.
- Produces:
  - Key pair `career-platform-production`.
  - An instance tagged `Name=career-platform-production`.
  - An Elastic IP tagged the same way and associated with the instance.
  - On stdout: `PUBLIC_IP=<eip>`.
  - On the instance: `/opt/career-platform/` (the compose project directory) and `/etc/career-platform/` (mode `700`, holding `rds-global-bundle.pem`).
- **What `user-data.sh` does:**
  - Runs `dnf -y upgrade` and installs `docker` and `dnf-automatic` (security updates applied by its timer).
  - Installs the Docker Compose plugin `v2.29.7` from its GitHub release, verified against the release's `.sha256`.
  - Adds a 1 GiB swap file, because the image build on 1 GB of RAM needs it.
  - Downloads the RDS global bundle and enables `docker`.
- **`compose.yml`:**
  - Service `app`: `build: .`, `env_file: /etc/career-platform/app.env`, mounts `/etc/career-platform/rds-global-bundle.pem` read-only, `restart: unless-stopped`, **no `ports:`**, `json-file` logs with `max-size: 10m` and `max-file: 5`.
  - Service `caddy`: image `caddy:2.8.4`, ports `80:80` and `443:443`, volumes `caddy_data` and `caddy_config`, `SITE_DOMAIN`/`TEST_DOMAIN` passed from `.env`.
- **`Caddyfile`:** `{$SITE_DOMAIN}, {$TEST_DOMAIN} { encode gzip; reverse_proxy app:8000 }`.

- [ ] **Step 1: Write the failing tests**

```python
def test_instance_launch_flags(fake_cli):
    run_script("create-instance.sh")  # stubs: no instance/key/EIP yet
    run = only_call(fake_cli, ["ec2", "run-instances"])
    joined = " ".join(run)
    assert "t3.micro" in joined and "HttpTokens=required" in joined
    assert '"VolumeType":"gp3"' in joined.replace(" ", "") and '"Encrypted":true' in joined.replace(" ", "")
    assert "file://" in joined and "user-data.sh" in joined

def test_user_data_contains_no_secrets_or_db_urls():
    text = (DEPLOY / "server/user-data.sh").read_text()
    assert "postgresql://" not in text and "PASSWORD" not in text.upper().replace("PASSWORD_FILE", "")

def test_app_port_is_never_published():
    compose = yaml.safe_load((DEPLOY / "server/compose.yml").read_text())
    assert "ports" not in compose["services"]["app"]
    assert sorted(compose["services"]["caddy"]["ports"]) == ["443:443", "80:80"]

def test_instance_rerun_reuses_instance_key_and_eip(fake_cli):
    # stubs: tagged instance running, key exists, tagged EIP associated
    run_script("create-instance.sh")
    for op in (["ec2", "run-instances"], ["ec2", "import-key-pair"], ["ec2", "allocate-address"]):
        assert not [c for c in fake_cli.calls() if c[:2] == op]
```

`pyyaml` 6.0.3 is importable in `.venv` today only as an indirect dependency. Add `"pyyaml>=6"` to the `dev` extras in `pyproject.toml` so CI doesn't depend on that.

- [ ] **Step 2: Run the tests and confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement the script and server files.** Then run `aws ec2 wait instance-status-ok`.
- [ ] **Step 4: Run the tests and confirm they pass.** Run: `.venv/bin/pytest tests/test_aws_scripts.py -v && bash -n deploy/aws/server/user-data.sh`. Expected: PASS.
- [ ] **Step 5: Commit.** Run `git add deploy/aws/create-instance.sh deploy/aws/server/user-data.sh deploy/aws/server/compose.yml deploy/aws/server/Caddyfile tests/test_aws_scripts.py pyproject.toml && git commit -m "feat(aws): launch the app instance with Caddy and compose"`.

### Task 5: Database bootstrap and deploy

**Files:**
- Create: `deploy/aws/bootstrap-database.sh`, `deploy/aws/deploy.sh`
- Test: `tests/test_aws_scripts.py`

**Interfaces:**
- Consumes:
  - `PUBLIC_IP`: from the tagged Elastic IP lookup.
  - `DB_ENDPOINT`: from `describe-db-instances`.
  - `$(secrets_dir)/rds-master-password`: from Task 3.
- Produces:
  - `bootstrap-database.sh`:
    - Creates `$(secrets_dir)/rds-app-password`.
    - Runs SQL through `ssh … docker run --rm -i postgres:18 psql` with the master credentials in stdin, never in argv: `CREATE ROLE career_app LOGIN PASSWORD …`, `ALTER DATABASE career_platform OWNER TO career_app`, `ALTER SCHEMA public OWNER TO career_app`. It skips any object that already exists.
    - Writes `/etc/career-platform/app.env` (mode `600`) through `ssh sudo tee` from stdin, with `DATABASE_URL` (in the Global Constraints form), `APP_ENV=production`, `SITE_URL=https://anarodriguezespinoza.com` and `PORT=8000`.
    - Writes `/opt/career-platform/.env` with `SITE_DOMAIN` and `TEST_DOMAIN`.
    - `bootstrap-database.sh --reset`: drops and recreates `career_platform`, owned by `career_app`, so a restore can be repeated. It runs only when `RESET_CONFIRM=career_platform`; otherwise it exits 6 and changes nothing.
  - `deploy.sh [REF]` (default `HEAD`):
    - Ships the code with `git archive --format=tar "$REF" | ssh … 'sudo tar -x -C /opt/career-platform/src'`, then copies `deploy/aws/server/{compose.yml,Caddyfile}` into `/opt/career-platform/`.
    - Builds and migrates: `docker compose build app`, then `docker compose run --rm app alembic upgrade head`, then `docker compose up -d`, then `docker image prune -f`.
    - Health-checks: polls `curl -fsS https://$TEST_DOMAIN/api/health` from the Mac for up to 60 s and exits non-zero unless the body contains `"database":"up"`.
    - Records the shipped commit in `/opt/career-platform/REVISION`.

- [ ] **Step 1: Write the failing tests**

```python
def test_bootstrap_sends_secrets_only_on_stdin(fake_cli):
    run_script("bootstrap-database.sh")
    master = (fake_cli.secrets / "rds-master-password").read_text().strip()
    app_pw = (fake_cli.secrets / "rds-app-password").read_text().strip()
    assert all(master not in " ".join(c) and app_pw not in " ".join(c) for c in fake_cli.calls("ssh"))
    assert any(app_pw in s and "sslmode=verify-full" in s for s in fake_cli.stdin("ssh"))

def test_reset_requires_confirmation(fake_cli):
    result = run_script("bootstrap-database.sh", "--reset")
    assert result.returncode == 6
    assert not any("DROP DATABASE" in s for s in fake_cli.stdin("ssh"))
    run_script("bootstrap-database.sh", "--reset", env={"RESET_CONFIRM": "career_platform"})
    assert any("DROP DATABASE career_platform" in s for s in fake_cli.stdin("ssh"))

def test_deploy_migrates_before_starting(fake_cli):
    fake_cli.respond(["-fsS"], '{"status":"ok","database":"up","publicSource":"database"}', tool="curl")
    result = run_script("deploy.sh")
    remote = " ".join(" ".join(c) for c in fake_cli.calls("ssh"))
    assert remote.index("alembic upgrade head") < remote.index("up -d")
    assert result.returncode == 0

def test_deploy_fails_when_health_is_not_up(fake_cli):
    fake_cli.respond(["-fsS"], '{"status":"unavailable","database":"down","publicSource":"none"}', tool="curl")
    assert run_script("deploy.sh", env={"HEALTH_TIMEOUT_SECONDS": "1"}).returncode != 0
```

- [ ] **Step 2: Run the tests and confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement both scripts.** `HEALTH_TIMEOUT_SECONDS` defaults to `60`. SSH uses `-o StrictHostKeyChecking=accept-new` and `-i ${SSH_PUBLIC_KEY%.pub}`.
- [ ] **Step 4: Run the tests and confirm they pass.** Expected: PASS.
- [ ] **Step 5: Commit.** Run `git add deploy/aws/bootstrap-database.sh deploy/aws/deploy.sh tests/test_aws_scripts.py && git commit -m "feat(aws): bootstrap the app role and deploy with release migrations"`.

### Task 6: Restore, backups, teardown, and docs

**Files:**
- Create: `deploy/aws/restore.sh`, `deploy/aws/fetch-backups.sh`, `deploy/aws/server/backup.sh`, `deploy/aws/server/career-platform-backup.service`, `deploy/aws/server/career-platform-backup.timer`
- Modify: `deploy/aws/teardown.sh`, `deploy/aws/deploy.sh` (installs the backup timer), `docs/deployment.md`
- Create: `docs/aws-cutover-runbook.md`
- Test: `tests/test_aws_scripts.py`

**Interfaces:**
- `restore.sh DUMP_FILE`:
  - Copies the dump with `scp` to `/tmp/restore.dump`.
  - Refuses with exit 5 and `Target database is not empty; refusing to restore.` if `SELECT count(*) FROM pg_tables WHERE schemaname='public'` is greater than 0.
  - Otherwise runs `pg_restore --no-owner --no-acl --exit-on-error` as `career_app` in `postgres:18`, then removes the dump from the instance.
  - **Comparison:** if `COMPARE_SOURCE_FROM_RAILWAY=1`, gets the source URL with `railway run --service Postgres -- printenv DATABASE_PUBLIC_URL`, pipes it over ssh stdin, and runs `docker compose run --rm -T app python -m app.compare_databases "$SOURCE" "$DATABASE_URL"` with `SOURCE` read from stdin. It exits with the compare tool's exit code.
- `server/backup.sh` (on the instance, run by the timer at 03:30 UTC daily):
  - Runs `pg_dump -Fc` as `career_app` into `/var/backups/career-platform/career-platform-<UTC stamp>.dump` (directory `700`).
  - Keeps the newest 14 dumps.
- `fetch-backups.sh`: `rsync`s that directory to `$(secrets_dir)/backups/`.
- `teardown.sh`:
  - Prints the resources it found and requires typing `delete career-platform-production`.
  - Then disables deletion protection, deletes the RDS instance **with** a final snapshot `career-platform-production-final-<stamp>`, terminates the instance, releases the Elastic IP, and deletes the security groups, subnet group and key pair.
  - With any other input it exits 6 and changes nothing.

- [ ] **Step 1: Write the failing tests**

```python
def test_restore_refuses_non_empty_target(fake_cli):
    fake_cli.respond(["-o"], "8", tool="ssh")  # table count query returns 8
    result = run_script("restore.sh", str(tmp_dump(fake_cli)))
    assert result.returncode == 5 and "not empty" in result.stdout + result.stderr
    assert not any("pg_restore" in " ".join(c) for c in fake_cli.calls("ssh"))

def test_restore_passes_compare_exit_code_and_hides_source_url(fake_cli):
    # stubs: table count 0; railway prints postgresql://u:secret@host/db; compare exits 2
    result = run_script("restore.sh", str(tmp_dump(fake_cli)), env={"COMPARE_SOURCE_FROM_RAILWAY": "1"})
    assert result.returncode == 2
    assert all("secret@host" not in " ".join(c) for c in fake_cli.calls("ssh"))
    assert "secret@host" not in result.stdout + result.stderr

def test_teardown_requires_exact_confirmation(fake_cli):
    result = run_script("teardown.sh", env={"CONFIRM": "yes"})
    assert result.returncode == 6
    assert not [c for c in fake_cli.calls() if c[1].startswith(("delete", "terminate", "release", "modify"))]

def test_teardown_keeps_a_final_snapshot(fake_cli):
    run_script("teardown.sh", env={"CONFIRM": "delete career-platform-production"})
    delete = only_call(fake_cli, ["rds", "delete-db-instance"])
    assert "--final-db-snapshot-identifier" in delete and "--skip-final-snapshot" not in delete
```

`teardown.sh` reads the confirmation from `$CONFIRM` when that's set, and otherwise from a `read` prompt.

- [ ] **Step 2: Run the tests and confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement the scripts.** `deploy.sh` (Task 5) also copies the two systemd units to `/etc/systemd/system/` and runs `systemctl enable --now career-platform-backup.timer`. Add a test asserting that `deploy.sh` calls `systemctl enable --now career-platform-backup.timer`.
- [ ] **Step 4: Write the docs.**
  - `docs/deployment.md`: an "AWS (EC2 + RDS)" section covering the architecture, settings, how to run each script, secrets locations, backups and the cost table.
  - `docs/aws-cutover-runbook.md`: the Task 7 phases as checkboxes, written in the same style as `docs/evidence/` (dated results, counts only).
- [ ] **Step 5: Run the full suite.** Run: `.venv/bin/ruff check app tests e2e migrations && .venv/bin/pytest && bash -n deploy/aws/*.sh deploy/aws/server/*.sh`. Expected: all pass.
- [ ] **Step 6: Commit.** Run `git add deploy/aws/restore.sh deploy/aws/fetch-backups.sh deploy/aws/teardown.sh deploy/aws/deploy.sh deploy/aws/server/backup.sh deploy/aws/server/career-platform-backup.service deploy/aws/server/career-platform-backup.timer docs/deployment.md docs/aws-cutover-runbook.md tests/test_aws_scripts.py && git commit -m "feat(aws): restore, nightly backups, teardown, and runbook"`.

### Task 7: Create, rehearse, and cut over

**Run this task only after the user approves each phase.** It creates billable resources and changes DNS. Every phase ends with a checkpoint. Record the results in `docs/aws-cutover-runbook.md` as counts and statuses only.

- [ ] **Phase 1: Preflight (read-only).** Run `aws login --profile isba-4775`, then `deploy/aws/preflight.sh`. Every check except the RDS `UNKNOWN` must pass.
- [x] **Phase 2: Database first.** Done 2026-11-03 by hand, with the plan's settings, before the scripts existed. RDS creation is permitted. Created: `career-platform-web` `sg-08d1de93cda5898df` (no inbound rules yet), `career-platform-db` `sg-0988aa1f6c5befb78` (5432 from the web group only), DB subnet group `career-platform-production`, and DB instance `career-platform-production` (1-day backups because of the Free plan). The scripts must find and reuse these by name.
  - Run `deploy/aws/create-network.sh`, then `deploy/aws/create-database.sh`.
  - **If it exits 4, stop.** RDS isn't permitted, and the plan doesn't work in this account. Delete the security groups with the `aws ec2 delete-security-group` commands the runbook lists.
  - Otherwise, wait for the database to become `available`. This takes about 10 minutes.
- [x] **Phase 3: Instance.** Done 2026-11-03 by hand, with the plan's settings, using `deploy/aws/server/user-data.sh` (written ahead of Task 4). Created: key pair `career-platform-production` (from `~/.ssh/id_ed25519.pub`); instance `i-0b7352490b62bb783` (t3.micro, AL2023 `ami-0c230065b91270bc6`, us-east-1a, launched with no public IP, IMDSv2 with hop limit 1, **CPU credits `standard`** so it can't run up surplus-credit charges); Elastic IP `3.227.143.37` (`eipalloc-0f71d0d557be8e93c`). Web group rules: 80 and 443 from anywhere, 22 from `157.242.208.31/32`. Checked: first boot finished, Compose v2.29.7, 1 GiB swap, `dnf-automatic` active, IMDS without a token returns 401, the instance reaches RDS on 5432, and the Mac reaches neither RDS 5432 nor instance 8000. RDS endpoint: `career-platform-production.cizoqym660ft.us-east-1.rds.amazonaws.com`.
  - **User, in the Cloudflare dashboard:** add an `A` record `aws` → `PUBLIC_IP`, **DNS only**. Don't touch the MX, SPF, DKIM or DMARC records.
- [ ] **Phase 4: Bootstrap and first deploy.** Run `deploy/aws/bootstrap-database.sh`, then `deploy/aws/deploy.sh`.
  - **Expected:** `https://aws.anarodriguezespinoza.com/api/health` returns `"database":"up"`.
  - The database is still empty at this point. The pages return 200 with no content, apart from the profile fallback.
- [ ] **Phase 5: Restore rehearsal.**
  - Take a fresh dump: `railway run --service Postgres -- sh -c 'pg_dump -d "$DATABASE_PUBLIC_URL" -Fc -f "$0"' ~/career-platform-cutover/railway-<stamp>.dump`.
  - If an earlier rehearsal already restored data, empty the database first with `RESET_CONFIRM=career_platform deploy/aws/bootstrap-database.sh --reset`.
  - Then run `COMPARE_SOURCE_FROM_RAILWAY=1 deploy/aws/restore.sh <dump>`.
  - **Expected:** exit 0, and every table `matched` with 0 changed and 0 missing.
  - Check `/`, `/projects`, `/skills`, `/experience` and `/resume` on the test domain. Time the whole phase; that's the downtime budget for Phase 6.
- [ ] **Phase 6: Cutover.** Pick a quiet hour, and lower the root record's TTL to 60 s a day before.
  1. **Freeze writes on Railway:** `railway variables --service career-platform-ana-rodriguezespinoza --set DATABASE_URL=postgresql://frozen.invalid/none`. Railway redeploys, and the site serves its 503 "temporarily unavailable" fallback, so no inquiry can be written.
  2. Take the final dump as in Phase 5, then run `RESET_CONFIRM=career_platform deploy/aws/bootstrap-database.sh --reset` and `COMPARE_SOURCE_FROM_RAILWAY=1 deploy/aws/restore.sh <dump>`. **Expected:** exit 0.
  3. **User, in Cloudflare:** replace the root `CNAME` to Railway with an `A` record → `PUBLIC_IP`, DNS only. Remove the `_railway-verify` TXT record only after Phase 7.
  4. Check `curl -sS https://anarodriguezespinoza.com/api/health` from the Mac. Caddy issues the root certificate on the first request. Then check the pages and submit one test inquiry.
  5. **Rollback, within the first hour:** set Railway's `DATABASE_URL` back to `${{Postgres.DATABASE_URL}}` and change the root record back to the Railway CNAME.
     - Inquiries written on AWS after the cutover show up as `extra` in `compare_databases <rds> <railway>`.
     - Copy them back by hand before the rollback is complete.
- [ ] **Phase 7: Settle (after 7 days without a rollback).**
  - Run `fetch-backups.sh` and check that a dump from each night is there.
  - Turn off Railway Postgres Public Access.
  - Leave the Railway services in place, unscaled, as a standby until the class account's end date is known.
  - Before the semester ends, take a final `fetch-backups.sh` and decide where the site goes next.

## Out of scope

- Turning on Cognito, SES or S3. This account denies S3 and SES, and IAM roles aren't available.
- Multi-AZ RDS, a load balancer, CloudFront, auto scaling, and CI/CD from GitHub Actions to AWS (which needs an IAM role or long-lived keys).
- CloudWatch Logs and agent metrics (denied), and external uptime monitoring.
- Changes to the application code or the `infra/` CDK app. The CDK app stays as it is and is unused.
