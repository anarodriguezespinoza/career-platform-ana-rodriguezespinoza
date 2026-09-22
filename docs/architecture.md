# System architecture

## Scope and components

The platform is a Next.js application in `src/`. Browser requests reach Next.js route handlers, server-rendered pages, or server actions. The application uses Prisma through `src/lib/db/client.ts` and the repositories in `src/lib/db/repositories/` to access PostgreSQL RDS in AWS (SQLite is used by the local development configuration). AWS Cognito authenticates the single owner, SES sends inquiry notifications, and a private versioned S3 object stores the last validated public-content snapshot.

The main boundaries are:

- **Public read path:** `src/lib/public/content.ts` loads published records through `ContentRepository.listPublished()`, projects them with `src/domain/content/publication.ts`, and falls back to `public/content.json` in S3 when the database read fails.
- **Admin path:** `src/middleware.ts` protects `/admin/*`; `src/lib/auth/require-admin.ts` verifies a Cognito ID token and checks `COGNITO_ADMIN_SUBJECT` or `COGNITO_ADMIN_EMAILS`. Server actions in `src/app/admin/` then use Prisma-backed services.
- **Inquiry path:** `src/app/api/contact/route.ts` validates and rate-limits a submission, persists `ContactInquiry`, then calls SES. A delivery failure changes `notificationStatus` to `FAILED` without losing the inquiry.
- **Health path:** `src/app/api/health/route.ts` probes Prisma with a bounded transaction, then checks the validated S3 snapshot if the database is down.

## Request and failure flows

### Public content

1. A browser requests a public page, resume route, metadata route, or project page.
2. Next.js calls `getPublicContent()` and the content repository reads only records with `publicationState = PUBLISHED`.
3. `buildPublicContent()` removes publication and audit timestamps and returns the public projection.
4. On a database error, `readPublicContent()` reads and schema-validates the S3 snapshot. A valid snapshot is served as read-only content and the source event is logged as `public_content_fallback` with `source: "snapshot"`.
5. If both sources fail, the request raises `PublicContentUnavailableError`; callers cannot silently substitute draft or private data.

A successful live read logs `public_content_source` with `source: "database"`. Snapshot reads accept schema versions 1 and 2 and normalize version 1 project records; writes always use schema version 2.

### Admin content

Cognito is the authentication provider. `requireAdmin()` verifies issuer, audience, token use, subject, and email before any admin server action can read drafts, save a draft, publish, unpublish, archive, or update inquiries. Publishing validates the complete publishable projection inside a Prisma transaction, changes non-archived records to `PUBLISHED`, and refreshes the S3 snapshot. Database errors are surfaced as a temporary database error; the snapshot is not an admin write substitute.

### Contact inquiry and SES

The contact route accepts a validated, rate-limited request and creates a `ContactInquiry` with `notificationStatus = PENDING`. It then sends the inquiry through `src/lib/email/ses.ts`. Success records `SENT`; an SES failure records `FAILED` and `notificationError`, while the API still returns the accepted response because the inquiry was durably stored. If the database write fails, the API returns an error and no notification is attempted.

### Exact health contract

`GET /api/health` returns JSON with these exact values:

| Situation | HTTP | `status` | `database` | `publicSource` |
| --- | ---: | --- | --- | --- |
| Prisma probe succeeds | 200 | `ok` | `up` | `database` |
| Prisma probe fails, validated snapshot exists | 200 | `degraded` | `down` | `snapshot` |
| Prisma probe and snapshot check fail | 503 | `unavailable` | `down` | `none` |

The endpoint uses a no-store response and returns an `x-request-id` correlation header. The database probe is bounded to 1,500 ms total (`maxWait` plus transaction timeout), so health checks do not wait indefinitely for RDS.

## Degraded-mode contract

When health is `degraded`, public read-only pages, project lookups, metadata, and resume generation may continue from the validated snapshot. They must not expose drafts or inquiry data. The health endpoint remains available so operators can see that the source is degraded.

The following operations are **not** supported in degraded mode: admin sign-in-dependent reads and writes, draft save, preview, publish/unpublish/archive, inquiry status or notes changes, inquiry deletion, and new contact submissions when Prisma is unavailable. Snapshot fallback is not a write queue and does not contain private inquiry fields. SES failure alone does not enter snapshot mode; it is represented on the persisted inquiry as `notificationStatus = FAILED`.

## Security and observability

The S3 bucket is private, encrypted, versioned, and restricted to the application role's `GetObject`/`PutObject` access for the snapshot key plus scoped listing. RDS is private and accepts PostgreSQL traffic only from the application security group. Production secrets are generated or managed by AWS and injected through Amplify or another secret manager; they are never committed to Git.

Structured logs in `src/lib/observability/logger.ts` redact credentials, tokens, message bodies, and private inquiry contents. Application, audit, and health log groups are provisioned by `infra/lib/observability-stack.ts`. The source-status events intentionally record only the selected source, not content.

See [Database](database.md), [Deployment and recovery](deployment.md), and the [system diagram](diagrams/system-architecture.mmd).
