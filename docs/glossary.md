# Glossary

| Term | Meaning in this platform |
| --- | --- |
| **Publication state** | The `DRAFT`, `PUBLISHED`, or `ARCHIVED` state on editable content. Only `PUBLISHED` records enter the public projection. |
| **Public projection** | The validated, published-only shape returned by `buildPublicContent()`. It removes internal publication and timestamp fields and excludes inquiries. |
| **Snapshot fallback** | A read-only recovery path that serves the last validated public projection from the private, versioned S3 object `public/content.json` when Prisma cannot read the database. |
| **Server action** | A Next.js function marked with `"use server"`, used here for authenticated admin mutations and draft preview. |
| **Cognito** | Amazon Cognito User Pools, used to authenticate the single owner/admin. Tokens are verified against the configured issuer, audience, and JWKS. |
| **RDS** | Amazon Relational Database Service. This deployment uses private PostgreSQL 16 for Prisma data. |
| **SES** | Amazon Simple Email Service v2. It sends contact-inquiry notifications after the inquiry is persisted. |
| **S3** | Amazon Simple Storage Service. This deployment stores a private, encrypted, versioned public-content snapshot. |
| **Migration** | A committed, ordered Prisma SQL change under `prisma/migrations/` that evolves the database schema. |
| **Migration gate** | The Amplify condition requiring `RUN_PRISMA_MIGRATIONS=true`, matching `RELEASE_ENVIRONMENT`/`AMPLIFY_ENV`, and matching `RELEASE_BRANCH`/`AWS_BRANCH` before `prisma migrate deploy` can run. |
| **Degraded** | Health status `degraded`: the database is down but a validated S3 snapshot is available, so public reads may continue while writes are stopped. |
| **Unavailable** | Health status `unavailable`: both the database and snapshot are unavailable; `/api/health` returns HTTP 503. |
| **Source** | The health response value `database`, `snapshot`, or `none`, identifying where public content is available. |
| **Least privilege** | Granting each runtime identity only the actions and resources it needs, such as S3 access limited to the snapshot key and RDS ingress limited to the application security group. |
| **Privacy boundary** | The conversion from editable Prisma records to `PublicContent`; private inquiry fields and non-published content cannot cross it. |
| **Recovery point** | A reviewed RDS or S3 version retained so the service can be restored without relying on the failing live resource. |
