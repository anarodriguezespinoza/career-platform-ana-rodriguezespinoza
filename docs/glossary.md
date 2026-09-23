# Glossary

| Term | Meaning in this platform |
| --- | --- |
| **Publication state** | The `DRAFT`, `PUBLISHED`, or `ARCHIVED` state on editable content. Only `PUBLISHED` records enter the public projection. |
| **Public projection** | The validated, published-only shape returned by `build_public_content()`. It removes internal publication and timestamp fields and excludes inquiries. |
| **Snapshot fallback** | A read-only recovery path that serves the last validated public projection from the private, versioned S3 object `public/content.json` when the database cannot be read. |
| **Admin form post** | An HTML form submission to an authenticated `/admin` route; the handler performs the mutation and redirects back (post/redirect/get). |
| **Cognito** | Amazon Cognito User Pools, used to authenticate the single owner/admin. Tokens are verified against the configured issuer, audience, and JWKS. |
| **RDS** | Amazon Relational Database Service. This deployment uses private PostgreSQL 16 for application data. |
| **SES** | Amazon Simple Email Service v2. It sends contact-inquiry notifications after the inquiry is persisted. |
| **S3** | Amazon Simple Storage Service. This deployment stores a private, encrypted, versioned public-content snapshot. |
| **Migration** | A committed, ordered Alembic revision under `migrations/versions/` that evolves the database schema. |
| **Release migration** | The explicit `alembic upgrade head` step run once per release against the target database, separate from starting application containers. |
| **Degraded** | Health status `degraded`: the database is down but a validated S3 snapshot is available, so public reads may continue while writes are stopped. |
| **Unavailable** | Health status `unavailable`: both the database and snapshot are unavailable; `/api/health` returns HTTP 503. |
| **Source** | The health response value `database`, `snapshot`, or `none`, identifying where public content is available. |
| **Least privilege** | Granting each runtime identity only the actions and resources it needs, such as S3 access limited to the snapshot key and RDS ingress limited to the application security group. |
| **Privacy boundary** | The conversion from editable database records to `PublicContent`; private inquiry fields and non-published content cannot cross it. |
| **Recovery point** | A reviewed RDS or S3 version retained so the service can be restored without relying on the failing live resource. |
