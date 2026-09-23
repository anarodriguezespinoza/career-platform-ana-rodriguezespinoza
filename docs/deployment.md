# Deployment and recovery

## Prerequisites

- Python 3.12+ (3.13 is used in CI and the container), Docker, Node.js 22 and npm (for CDK and the Tailwind CSS build only), AWS CLI, and an authenticated AWS principal with permission to bootstrap/deploy CDK and inspect RDS, S3, Cognito, SES, CloudWatch, Secrets Manager, and the container runtime.
- A verified SES sender identity in the target AWS account/region.
- An AWS account and region selected through `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` (or the normal CDK environment configuration).
- A container runtime for the application image. ECS Fargate is the intended target: the CDK `ApplicationRole` already trusts `ecs-tasks.amazonaws.com` and grants the snapshot S3 access. The CDK app does not yet define the compute service itself.
- Production secrets injected from AWS Secrets Manager (or another approved secret manager) as container environment variables. Do not commit them or place them in `.env.example`.

## Local application configuration

Copy `.env.example` to `.env` and fill development-only values, then:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
set -a && source .env && set +a
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

The runtime requires `DATABASE_URL`, `COGNITO_ISSUER`, `COGNITO_CLIENT_ID`, `S3_SNAPSHOT_BUCKET`, `SES_FROM_EMAIL`, and `SES_TO_EMAIL`. `DATABASE_URL` accepts SQLAlchemy URLs as well as the earlier `file:` and `postgresql://` forms. `S3_SNAPSHOT_KEY` defaults to `public/content.json`. `SITE_URL` sets canonical URLs, `robots.txt`, and the sitemap. `APP_ENV=production` marks the session cookie `Secure`. Admin access additionally requires `COGNITO_ADMIN_SUBJECT` or at least one address in `COGNITO_ADMIN_EMAILS`, and the Cognito app client must allow the `USER_SRP_AUTH` flow (the CDK `WebClient` does).

Styles are Tailwind classes in the Jinja templates, compiled into the committed `app/static/css/site.css`. After changing classes, run `./scripts/build-css.sh`; CI fails if the compiled file is stale.

## CDK bootstrap and deployment

The CDK app is `infra/bin/career-platform.ts`; the stacks are in `infra/lib/`. Install and compile the infrastructure package first:

```bash
npm ci --prefix infra
npm run build --prefix infra
export AWS_REGION=us-east-1
export CDK_DEFAULT_REGION="$AWS_REGION"
export SES_FROM_EMAIL=verified-development@example.com
npx --prefix infra cdk bootstrap "aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION"
cd infra && npx cdk synth -c environment=development -c sesFromEmail="$SES_FROM_EMAIL" && cd ..
cd infra && npx cdk deploy --all -c environment=development -c sesFromEmail="$SES_FROM_EMAIL" && cd ..
```

Use the approved production account/region and a separately verified production sender for production. The entrypoint rejects any environment other than `development` or `production` and rejects a missing `sesFromEmail` context (or `SES_FROM_EMAIL`). The SES value is passed as CDK context deliberately; it is an email identity, not a secret.

```bash
export SES_FROM_EMAIL=verified-production@example.com
cd infra && npx cdk synth -c environment=production -c sesFromEmail="$SES_FROM_EMAIL" && cd ..
cd infra && npx cdk deploy --all -c environment=production -c sesFromEmail="$SES_FROM_EMAIL" && cd ..
```

Review the synthesized template before deployment. `DataStack` creates private encrypted PostgreSQL with generated Secrets Manager credentials; `StorageStack` creates a private versioned encrypted bucket and the `public/content.json` key; `IdentityStack` creates the owner Cognito pool/client and SES identity; `ObservabilityStack` creates application, audit, and health log groups. Capture stack outputs for the managed application configuration, but never print or commit secret values.

## Application image and release migrations

Build and push the image from the repository root:

```bash
docker build -t career-platform:<revision> .
```

The image runs `uvicorn app.main:app` on port 8000 as a non-root user, trusting `X-Forwarded-*` headers from the load balancer. Configure these environment variables on the service, with credentials sourced from Secrets Manager: `APP_ENV`, `SITE_URL`, `DATABASE_URL`, `COGNITO_ISSUER`, `COGNITO_CLIENT_ID`, `COGNITO_ADMIN_SUBJECT` and/or `COGNITO_ADMIN_EMAILS`, `S3_SNAPSHOT_BUCKET`, `S3_SNAPSHOT_KEY`, `SES_FROM_EMAIL`, and `SES_TO_EMAIL`. Run the task with the CDK `ApplicationRole` so S3 access stays scoped to the snapshot key. Point the load balancer health check at `/api/health`.

### Release migrations

Containers never migrate on start-up. For each approved release, run the migration once as a one-off task from the same image and with the same `DATABASE_URL` as the application, before shifting traffic:

```bash
docker run --rm -e DATABASE_URL="$DATABASE_URL" career-platform:<revision> alembic upgrade head
```

Pull-request and preview environments must not be given production database credentials, so they cannot migrate a release database accidentally. For a database that Prisma previously managed, run `alembic stamp 0001` once instead (see [database](database.md#migration-workflow)).

## Health verification

After deployment and after migrations, verify the deployed origin:

```bash
curl --fail-with-body -sS -D - https://<app-domain>/api/health
```

A healthy response is HTTP 200 with `{"status":"ok","database":"up","publicSource":"database"}`. During an RDS outage, HTTP 200 with `{"status":"degraded","database":"down","publicSource":"snapshot"}` means public read-only content can continue from the last validated snapshot. HTTP 503 with `{"status":"unavailable","database":"down","publicSource":"none"}` means neither source is available; stop traffic changes and begin recovery. Also exercise a public page, the resume route, owner sign-in, and (in development) a contact submission without exposing inquiry contents in logs.

## Snapshot recovery

The S3 bucket is versioned. Preserve the current object and inspect versions before restoring:

```bash
aws s3api list-object-versions --bucket "$S3_SNAPSHOT_BUCKET" --prefix "$S3_SNAPSHOT_KEY"
aws s3 cp "s3://$S3_SNAPSHOT_BUCKET/$S3_SNAPSHOT_KEY" ./content-current.json
aws s3 cp ./content-current.json "s3://$S3_SNAPSHOT_BUCKET/recovery/content-current-$(date -u +%Y%m%dT%H%M%SZ).json"
```

To restore a known-good version, substitute the reviewed `VersionId` and copy it over the live key; S3 object versioning preserves the previous live value:

```bash
export SNAPSHOT_VERSION_ID=<reviewed-version-id>
aws s3api copy-object \
  --bucket "$S3_SNAPSHOT_BUCKET" \
  --copy-source "$S3_SNAPSHOT_BUCKET/$S3_SNAPSHOT_KEY?versionId=$SNAPSHOT_VERSION_ID" \
  --key "$S3_SNAPSHOT_KEY" \
  --content-type application/json \
  --metadata-directive COPY
curl --fail-with-body -sS https://<app-domain>/api/health
```

Only restore an object that passes the schema enforced by `parse_snapshot()` in `app/domain/snapshot.py`. Snapshot recovery restores public read availability; it does not restore drafts, inquiries, or database writes. Once RDS is healthy, republish from the database to generate a fresh schema version 2 snapshot.

## Database recovery and rollback

Before destructive changes, preserve the latest RDS automated/manual snapshot and the S3 snapshot. Prefer a forward Alembic migration over rollback. If an applied migration is unsafe, do not edit it or `alembic stamp` past it as a shortcut. Restore the RDS snapshot to an isolated instance, validate migrations and application behavior there, then update the managed database secret/`DATABASE_URL` through the approved release process:

```bash
aws rds describe-db-snapshots --db-instance-identifier <instance-id>
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier career-platform-recovery \
  --db-snapshot-identifier <approved-snapshot-arn> \
  --db-instance-class <matching-instance-class>
aws rds wait db-instance-available --db-instance-identifier career-platform-recovery
```

Do not expose the recovery endpoint publicly until security groups, backups, migrations, and health checks have been verified. After changing the managed connection value, redeploy the approved application revision, run `alembic upgrade head` only as the release migration step, verify `/api/health`, then verify public content and owner/admin access. Production RDS has deletion protection, encrypted storage, retained snapshots, and a 14-day backup retention policy in `infra/lib/data-stack.ts`.

## Operational references

- Application checks: `ruff check app tests e2e migrations`, `pytest`, and `pytest e2e` for the release gate (requires `pip install -e ".[e2e]"`, `playwright install chromium`, and the `E2E_*` variables).
- Infrastructure checks: `npm run build --prefix infra`, `npm test --prefix infra`.
- CI definition: `.github/workflows/ci.yml`.
- Container definition: `Dockerfile`.
- CDK entrypoint and stacks: `infra/bin/career-platform.ts`, `infra/lib/`.
- Models and migration history: `app/models.py`, `migrations/versions/`.
