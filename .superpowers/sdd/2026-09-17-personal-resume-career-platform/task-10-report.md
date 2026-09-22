# Task 10 Infrastructure Report

## Status

Implemented and verified AWS CDK infrastructure, environment separation, Amplify build configuration, CI checks, and infrastructure synthesis tests.

## Delivered

- Five environment-qualified CDK stacks: network, data, identity, storage, and observability.
- Development/production context validation with separate stack/resource names.
- Private isolated RDS PostgreSQL with generated Secrets Manager credentials, encryption, backups, deletion protection in production, and application-to-database-only ingress.
- Cognito owner user pool/client and SES sender identity output without secret values.
- Versioned encrypted private S3 snapshot bucket with blocked public access and least-privilege application access.
- Retained application, audit, and health CloudWatch log groups.
- Stack outputs for secret ARN, Cognito issuer/client identifiers, snapshot bucket/key, SES sender identity, and log group names; no plaintext credentials are emitted.
- Amplify build phases for dependency installation, Prisma generation/migrations, lint, typecheck, tests, and Next.js build.
- GitHub Actions pull-request/push checks for application tests and both CDK environment synths.
- README and `.env.example` deployment/environment documentation.

## Verification

- `npm --prefix infra test -- tests/infra/cdk-synth.test.ts` — passed (5 tests).
- `npm --prefix infra run build` — passed.
- `npx cdk synth -c environment=development` from `infra/` — passed.
- `npx cdk synth -c environment=production` from `infra/` — passed.
- `npm run lint` — passed; Next.js reported its existing deprecation/workspace-root warnings only.
- `npm run typecheck` — passed.
- `npm test` — passed (89 application tests; infrastructure tests are run by the infra package to use its CDK dependencies).
- `npm run build` — passed.
- Synthesized templates inspected for required outputs, private/encrypted resources, and absence of plaintext secret values. RDS password fields are CloudFormation dynamic references to the generated secret, not secret contents.

## Concerns

- CDK emits the standard cross-stack-reference strength and feature-flag warnings during synth; synthesis remains successful and no deployment was attempted.
- SES identity defaults to `owner@example.com` only when no managed `SES_FROM_EMAIL`/`sesFromEmail` value is supplied; deployment environments should set the verified sender identity through managed configuration before deployment.

## Review findings resolved (2026-09-22)

- **Prisma migrations:** Amplify no longer migrates on ordinary builds or pull-request previews. Migrations require managed `RUN_PRISMA_MIGRATIONS=true`, matching `RELEASE_ENVIRONMENT`/`AMPLIFY_ENV`, and matching `RELEASE_BRANCH`/`AWS_BRANCH`. The policy is documented in `README.md` and covered by `tests/infra/amplify-config.test.ts`.
- **RDS secret access:** The ECS application runtime role from `StorageStack` is passed to `DataStack`, which grants it `secretsmanager:GetSecretValue` and `secretsmanager:DescribeSecret` for only the generated environment-specific database secret. Synthesis coverage verifies the grant.
- **SES sender:** The placeholder sender fallback was removed. CDK now requires `-c sesFromEmail=<verified address>` or `SES_FROM_EMAIL`; missing values fail synthesis, including production. Tests cover the failure path.

## Review-fix verification

- `npm --prefix infra run build` — passed.
- `npm --prefix infra test -- tests/infra/cdk-synth.test.ts tests/infra/amplify-config.test.ts` — passed (9 tests).
- `npx cdk synth -c environment=development -c sesFromEmail=verified@example.com` — passed.
- `npx cdk synth -c environment=production -c sesFromEmail=verified@example.com` — passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed (89 tests).
- `npm run build` — passed.

## Remaining review issue resolved (2026-09-22)

- **README deploy context:** Development and production CDK deploy examples now explicitly export a verified `SES_FROM_EMAIL` and pass `-c sesFromEmail="$SES_FROM_EMAIL"`. This matches the CDK entrypoint's required context and prevents deploy commands from failing due to a missing SES sender.

## Final docs/synth verification

- README command inspection confirmed both deploy examples include `-c sesFromEmail="$SES_FROM_EMAIL"`.
- `npx cdk synth -c environment=development -c sesFromEmail=verified-development@example.com` — passed.
- `npx cdk synth -c environment=production -c sesFromEmail=verified-production@example.com` — passed.
