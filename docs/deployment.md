# Deployment and recovery

## Prerequisites

- Node.js 22, npm, AWS CLI, and an authenticated AWS principal with permission to bootstrap/deploy CDK and inspect RDS, S3, Cognito, SES, CloudWatch, Secrets Manager, and Amplify.
- A verified SES sender identity in the target AWS account/region.
- An AWS account and region selected through `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` (or the normal CDK environment configuration).
- A development or production Amplify app connected to this repository.
- Production secrets managed by Amplify environment variables, AWS Secrets Manager, or another approved secret manager. Do not commit them or place them in `.env.example`.

## Local application configuration

Copy `.env.example` to `.env.local` and fill development-only values:

```bash
cp .env.example .env.local
npm ci
npx prisma generate
npm run dev
```

The runtime requires `DATABASE_URL`, `COGNITO_ISSUER`, `COGNITO_CLIENT_ID`, `S3_SNAPSHOT_BUCKET`, `SES_FROM_EMAIL`, and `SES_TO_EMAIL`. `S3_SNAPSHOT_KEY` defaults to `public/content.json` in the snapshot reader. Admin access additionally requires `COGNITO_ADMIN_SUBJECT` or at least one address in `COGNITO_ADMIN_EMAILS`.

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

## Amplify setup and migration gate

In Amplify, connect the repository and configure the build from the checked-in `amplify.yml`. Set these managed variables for the selected environment: `DATABASE_URL`, `COGNITO_ISSUER`, `COGNITO_CLIENT_ID`, `COGNITO_ADMIN_SUBJECT` and/or `COGNITO_ADMIN_EMAILS`, `S3_SNAPSHOT_BUCKET`, `S3_SNAPSHOT_KEY`, `SES_FROM_EMAIL`, and `SES_TO_EMAIL`. Also set `AMPLIFY_ENV` to `development` or `production`.

The build always runs `npm ci`, `npx prisma generate`, lint, typecheck, tests, and `npm run build`. Prisma migration deployment is disabled by default. Enable it only on the approved release branch by setting all of the following in managed configuration:

```text
RUN_PRISMA_MIGRATIONS=true
RELEASE_ENVIRONMENT=<development-or-production>
RELEASE_BRANCH=<approved-release-branch>
```

The gate runs `npx prisma migrate deploy` only if `RELEASE_ENVIRONMENT = AMPLIFY_ENV` and `AWS_BRANCH = RELEASE_BRANCH`. Pull-request previews and ordinary branch builds therefore cannot migrate an environment accidentally. The migration command uses the same managed `DATABASE_URL` as the application.

## Health verification

After deployment and after migrations, verify the deployed origin:

```bash
curl --fail-with-body -sS -D - https://<amplify-domain>/api/health
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
curl --fail-with-body -sS https://<amplify-domain>/api/health
```

Only restore an object that passes the schema used by `src/lib/fallback/snapshot-schema.ts`. Snapshot recovery restores public read availability; it does not restore drafts, inquiries, or database writes. Once RDS is healthy, republish from the database to generate a fresh schema version 2 snapshot.

## Database recovery and rollback

Before destructive changes, preserve the latest RDS automated/manual snapshot and the S3 snapshot. Prefer a forward Prisma migration over rollback. If an applied migration is unsafe, do not edit its SQL or run `prisma migrate resolve` as a shortcut. Restore the RDS snapshot to an isolated instance, validate migrations and application behavior there, then update the managed database secret/`DATABASE_URL` through the approved release process:

```bash
aws rds describe-db-snapshots --db-instance-identifier <instance-id>
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier career-platform-recovery \
  --db-snapshot-identifier <approved-snapshot-arn> \
  --db-instance-class <matching-instance-class>
aws rds wait db-instance-available --db-instance-identifier career-platform-recovery
```

Do not expose the recovery endpoint publicly until security groups, backups, migrations, and health checks have been verified. After changing the managed connection value, redeploy the approved application revision, run `npx prisma migrate deploy` only through the release gate, verify `/api/health`, then verify public content and owner/admin access. Production RDS has deletion protection, encrypted storage, retained snapshots, and a 14-day backup retention policy in `infra/lib/data-stack.ts`.

## Operational references

- Application checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Infrastructure checks: `npm run build --prefix infra`, `npm test --prefix infra -- tests/infra/cdk-synth.test.ts tests/infra/amplify-config.test.ts`.
- CI definition: `.github/workflows/ci.yml`.
- Amplify definition and migration gate: `amplify.yml`.
- CDK entrypoint and stacks: `infra/bin/career-platform.ts`, `infra/lib/`.
- Schema and migration history: `prisma/schema.prisma`, `prisma/migrations/`.
