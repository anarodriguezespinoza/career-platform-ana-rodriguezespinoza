# Task 10 AWS Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define reproducible development and production AWS infrastructure with CDK, Amplify deployment configuration, CI checks, and synthesis coverage while preserving the app's existing environment, S3, Cognito, SES, health, and logging contracts.

**Architecture:** A TypeScript CDK app selects `development` or `production` from context and instantiates five focused stacks. The network stack owns VPC/subnets/security groups; data owns encrypted PostgreSQL and secret references; identity owns the single-owner Cognito pool/client; storage owns encrypted private S3 and IAM; observability owns retained CloudWatch log groups. Amplify and GitHub Actions consume environment-managed values and never commit credentials or secret values.

**Tech Stack:** AWS CDK v2, TypeScript, RDS PostgreSQL, Amazon Cognito, S3, SES v2 identity, CloudWatch Logs, Next.js, Prisma, GitHub Actions, Vitest.

**Spec:** `.superpowers/sdd/2026-09-17-personal-resume-career-platform/task-10-brief.md`

## Global Constraints

- CDK context accepts only `development` or `production`.
- Stack names and resource names are environment-qualified and cannot collide.
- RDS uses private subnets, encryption, backups, and ingress only from the application security group.
- S3 blocks public access and uses server-side encryption.
- Outputs expose references/identifiers only, never plaintext secret values.
- Production credentials are supplied by managed environment secrets, not repository files.
- Existing app variables remain the contract: `DATABASE_URL`, Cognito issuer/client identifiers, `S3_SNAPSHOT_BUCKET`, `S3_SNAPSHOT_KEY`, `SES_FROM_EMAIL`, and `SES_TO_EMAIL`.

---

### Task 1: Add failing CDK synthesis tests

**Files:**
- Create: `infra/package.json`
- Create: `infra/tsconfig.json`
- Create: `infra/cdk.json`
- Create: `tests/infra/cdk-synth.test.ts`

**Interfaces:**
- Tests import the CDK app entrypoint from `infra/bin/career-platform` after the app is implemented.
- Tests use `aws-cdk-lib/assertions.Template` and synthesize both context values.

- [ ] **Step 1: Define infra test scripts and CDK dependencies**
- [ ] **Step 2: Write tests for environment-qualified stacks/resources, private RDS networking, restricted ingress, encrypted private S3, Cognito, SES, log retention, outputs, and absence of secret literals.**
- [ ] **Step 3: Run `npm --prefix infra test -- tests/infra/cdk-synth.test.ts` and confirm failure because the CDK app is absent.**

### Task 2: Implement CDK stacks and environment entrypoint

**Files:**
- Create: `infra/bin/career-platform.ts`
- Create: `infra/lib/network-stack.ts`
- Create: `infra/lib/data-stack.ts`
- Create: `infra/lib/identity-stack.ts`
- Create: `infra/lib/storage-stack.ts`
- Create: `infra/lib/observability-stack.ts`

**Interfaces:**
- `NetworkStack` exports `vpc`, `applicationSecurityGroup`, and `databaseSecurityGroup`.
- `DataStack` exports a Secrets Manager secret reference, RDS endpoint/port, and log-independent outputs.
- `IdentityStack` exports user pool, client, issuer URL, and client ID.
- `StorageStack` exports bucket name/key and a least-privilege application role/policy.
- `ObservabilityStack` exports application/audit/health log group names.

- [ ] **Step 1: Implement context validation and environment-qualified stack construction.**
- [ ] **Step 2: Implement VPC with isolated/private database subnets and security groups allowing database ingress only from the application group.**
- [ ] **Step 3: Implement encrypted PostgreSQL with deletion protection/backups appropriate to production, generated credentials, and no secret value in outputs.**
- [ ] **Step 4: Implement Cognito user pool/client for one owner, with secure defaults and issuer/client outputs.**
- [ ] **Step 5: Implement encrypted versioned S3 with blocked public access, snapshot key output, and least-privilege read/write access.**
- [ ] **Step 6: Implement SES identity configuration and retained CloudWatch log groups.**
- [ ] **Step 7: Run `npm --prefix infra test -- tests/infra/cdk-synth.test.ts` and fix assertions/implementation until green.**

### Task 3: Add Amplify build and CI workflows

**Files:**
- Create: `amplify.yml`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Amplify uses the selected environment's managed variables and runs install, Prisma generate/migrate policy, lint, typecheck, unit tests, and Next.js build.
- CI runs application checks and `npm --prefix infra run build`, then synthesizes development and production templates without AWS credentials.

- [ ] **Step 1: Add Amplify phases with `npm ci`, Prisma generation, environment-gated migrations, checks, and build.**
- [ ] **Step 2: Add pull-request CI for app checks, infra build, and both CDK synth contexts.**
- [ ] **Step 3: Verify no credential or secret literals are present in either workflow.**

### Task 4: Update environment/docs and run full validation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Create: `.superpowers/sdd/2026-09-17-personal-resume-career-platform/task-10-report.md`

- [ ] **Step 1: Document environment-specific CDK commands, required managed variables, Amplify setup, health verification, and rollback/recovery expectations.**
- [ ] **Step 2: Extend `.env.example` with non-secret infrastructure references such as environment and snapshot key while keeping values blank/placeholders.**
- [ ] **Step 3: Run `npm --prefix infra run build && npx --prefix infra cdk synth -c environment=development && npx --prefix infra cdk synth -c environment=production && npm run lint && npm run typecheck && npm test`.**
- [ ] **Step 4: Inspect synthesized templates for required security properties and write the report with status, commands, and concerns.**
- [ ] **Step 5: Commit all Task 10 files with `feat: define AWS deployment infrastructure` and the required Copilot co-author trailer.**
