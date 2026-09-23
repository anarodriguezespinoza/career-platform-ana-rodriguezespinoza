# System architecture

## Scope and components

The platform is a FastAPI application in `app/` that renders server-side HTML with Jinja templates (`app/templates/`). Browser requests reach FastAPI routers in `app/routes/`: public pages, JSON/file endpoints under `/api`, owner sign-in, and admin pages whose mutations are plain HTML form posts (post/redirect/get). The application uses SQLAlchemy through `app/db.py` and the repositories in `app/repositories.py` to access PostgreSQL RDS in AWS (SQLite is used for local development and tests). AWS Cognito authenticates the single owner, SES sends inquiry notifications, and a private versioned S3 object stores the last validated public-content snapshot.

The main boundaries are:

- **Public read path:** `app/public_content.py` loads published records through `ContentRepository.list_published()`, projects them with `app/domain/content.py`, and falls back to `public/content.json` in S3 (`app/domain/snapshot.py`) when the database read fails.
- **Admin path:** every `/admin` route depends on `admin_identity` in `app/routes/security.py`, which calls `require_admin()` in `app/auth.py` to verify the Cognito ID token from the `cognito-access-token` cookie and check `COGNITO_ADMIN_SUBJECT` or `COGNITO_ADMIN_EMAILS`. Unauthenticated or non-allowlisted requests are redirected to `/sign-in?returnTo=…`. Admin form posts additionally reject cross-origin `Origin`/`Referer` headers; the session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- **Sign-in:** `POST /sign-in` authenticates with Cognito's SRP flow server-side (`pycognito`), verifies the returned ID token against the allowlist, and sets the session cookie. `GET /api/auth/session` still exchanges a `Bearer` ID token for the cookie for non-browser clients.
- **Inquiry path:** `POST /contact` (HTML form) and `POST /api/contact` (JSON) validate and rate-limit a submission, persist `ContactInquiry`, then call SES. A delivery failure changes `notificationStatus` to `FAILED` without losing the inquiry.
- **Health path:** `GET /api/health` in `app/routes/api.py` runs `SELECT 1` bounded by a 1.5 s timeout, then checks the validated S3 snapshot if the database is down.

## Request and failure flows

### Public content

1. A browser requests a public page, the resume PDF, the sitemap, or a project page.
2. The route calls `get_public_content()` and the content repository reads only records with `publicationState = PUBLISHED`.
3. `build_public_content()` removes publication state and audit timestamps and returns the public projection.
4. On a database error, `read_public_content()` reads and schema-validates the S3 snapshot. A valid snapshot is served as read-only content and the source event is logged as `public_content_fallback` with `source: "snapshot"`; pages show a status banner.
5. If both sources fail, the request raises `PublicContentUnavailableError` and the visitor sees a 503 page; callers cannot silently substitute draft or private data.

A successful live read logs `public_content_source` with `source: "database"`. The snapshot store is created lazily, so healthy reads never touch S3. Snapshot reads accept schema versions 1 and 2 and normalize version 1 project records; writes always use schema version 2 in the same camelCase JSON format as earlier releases.

### Admin content

Cognito is the authentication provider. `require_admin()` verifies signature (JWKS), issuer, audience, expiry, token use, subject, and email before any admin route can read drafts, save a draft, publish, unpublish, archive, or update inquiries. Publishing validates the complete publishable projection inside a database transaction, changes non-archived records to `PUBLISHED`, and refreshes the S3 snapshot. Database errors are surfaced as a temporary database error; the snapshot is not an admin write substitute.

### Contact inquiry and SES

The contact endpoints accept a validated, rate-limited request and create a `ContactInquiry` with `notificationStatus = PENDING`. They then send the inquiry through SES (`send_inquiry_notification` in `app/domain/inquiries.py`). Success records `SENT`; an SES failure records `FAILED` and `notificationError`, while the endpoint still reports success because the inquiry was durably stored. If the database write fails, the endpoint returns an error and no notification is attempted. The rate limiter is in-process, so limits apply per application instance.

### Exact health contract

`GET /api/health` returns JSON with these exact values:

| Situation | HTTP | `status` | `database` | `publicSource` |
| --- | ---: | --- | --- | --- |
| Database probe succeeds | 200 | `ok` | `up` | `database` |
| Database probe fails, validated snapshot exists | 200 | `degraded` | `down` | `snapshot` |
| Database probe and snapshot check fail | 503 | `unavailable` | `down` | `none` |

The endpoint uses a no-store response and returns an `x-request-id` correlation header. The database probe is bounded to 1,500 ms, so health checks do not wait indefinitely for RDS.

## Degraded-mode contract

When health is `degraded`, public read-only pages, project lookups, and the sitemap may continue from the validated snapshot; the resume page links to the configured `resumeUrl` instead of generating a PDF. They must not expose drafts or inquiry data. The health endpoint remains available so operators can see that the source is degraded.

The following operations are **not** supported in degraded mode: admin reads and writes, draft save, preview, publish/unpublish/archive, inquiry status or notes changes, inquiry deletion, and new contact submissions when the database is unavailable. Snapshot fallback is not a write queue and does not contain private inquiry fields. SES failure alone does not enter snapshot mode; it is represented on the persisted inquiry as `notificationStatus = FAILED`.

## Security and observability

The S3 bucket is private, encrypted, versioned, and restricted to the application role's `GetObject`/`PutObject` access for the snapshot key plus scoped listing. RDS is private and accepts PostgreSQL traffic only from the application security group. Production secrets are generated or managed by AWS and injected as container environment variables from Secrets Manager or another secret manager; they are never committed to Git.

Structured JSON logs from `app/observability.py` redact credentials, tokens, message bodies, and private inquiry contents. Application, audit, and health log groups are provisioned by `infra/lib/observability-stack.ts`. The source-status events intentionally record only the selected source, not content.

See [Database](database.md), [Deployment and recovery](deployment.md), and the [system diagram](diagrams/system-architecture.mmd).
