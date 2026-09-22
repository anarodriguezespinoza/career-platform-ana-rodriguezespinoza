# Database and privacy model

## Prisma models

The schema is `prisma/schema.prisma`; migrations live in `prisma/migrations/` and are applied in order.

| Model | Purpose and important fields | Relationships / indexes |
| --- | --- | --- |
| `Profile` | The owner profile: name, headline, summary, email, location, optional avatar URL, timestamps, and `publicationState`. | One logical profile is selected by stable ID ordering; no foreign keys. |
| `Experience` | Work history with company, role, description, dates, display order, timestamps, and `publicationState`. | Ordered by `displayOrder`, then `id`; indexed by publication state and order. |
| `Project` | Portfolio project with unique `slug`, description, optional links, featured flag, order, timestamps, and `publicationState`. | Has many `ProjectTechnology` rows; deleting a project cascades to its technologies. |
| `ProjectTechnology` | A technology label and display order for a project. | Composite primary key `(projectId, technology)` and foreign key to `Project`. |
| `Skill` | Skill name, category, display order, timestamps, and `publicationState`. | Ordered and indexed by publication state and order. |
| `ResumeSettings` | Resume title, intro, optional resume URL, update time, and `publicationState`. | One logical published settings row is selected by stable ID ordering. |
| `ContactInquiry` | Private contact submission: name, email, message, opportunity type, source, private notes, workflow status, notification status/error, and timestamps. | Indexed by inquiry status and notification status with creation time; no public relationship. |

`ContactInquiry` uses `status` values `NEW`, `READ`, `REPLIED`, and `ARCHIVED`. Its notification state is independent: `PENDING`, `SENT`, or `FAILED`.

## Publication state and projection boundary

Content models use the exact string states `DRAFT`, `PUBLISHED`, and `ARCHIVED`.

- Saving a draft upserts the record and forces `DRAFT`.
- Publishing validates the would-be public content in a transaction, changes every non-archived content record to `PUBLISHED`, and refreshes the snapshot.
- Unpublishing changes a record to `DRAFT`; archiving changes it to `ARCHIVED`. Archived records remain available to the owner but are excluded from the public view.
- `buildPublicContent()` is the privacy boundary. It filters to `PUBLISHED`, orders records deterministically, and omits publication state, `createdAt`, and `updatedAt` from public content. The public profile intentionally includes its public contact email, but `ContactInquiry` is never part of `PublicContent`.

The snapshot schema mirrors this public projection exactly: it contains only `profile`, `experience`, `projects` (including public technology rows), `skills`, and `resumeSettings`. It never contains drafts, archived records, private notes, notification errors, or inquiry messages.

## Access boundaries

- **Public browser:** receives `PublicContent` from the live database or validated S3 snapshot.
- **Owner/admin:** reaches draft content and inquiries only through Cognito-authenticated middleware and `requireAdmin()`. The allow-list is configured by `COGNITO_ADMIN_SUBJECT` or `COGNITO_ADMIN_EMAILS`.
- **Application runtime:** uses Prisma for RDS and a least-privilege S3 role for the single snapshot object. Database credentials come from the environment/secret manager.
- **SES:** receives only the fields needed to notify the owner (`id`, name, email, message, opportunity type). SES is not a source of truth.

## Manual deletion policy

Inquiry deletion is an explicit owner action in `src/app/admin/inquiries/actions.ts`. It requires Cognito authorization, deletes exactly the selected `ContactInquiry` by ID, and revalidates the admin list. There is no public deletion endpoint, cascade from content records, or automatic purge in the application. Operators must follow the organization's retention and legal requirements before deleting; the deletion is permanent at the application level.

## Migration workflow

1. Edit `prisma/schema.prisma` and create a named migration locally with `npx prisma migrate dev --name <change>` after validating the local database.
2. Review the generated SQL and run `npx prisma generate`.
3. Run the application checks (`npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`) before release.
4. Apply committed migrations to a deployed database with `npx prisma migrate deploy`. The Amplify build runs this command only when `RUN_PRISMA_MIGRATIONS=true`, `RELEASE_ENVIRONMENT` equals `AMPLIFY_ENV`, and `AWS_BRANCH` equals the explicitly configured `RELEASE_BRANCH`.
5. Preview builds and ordinary builds do not migrate. Never use `prisma db push` against RDS and never edit an applied migration in place.

For a failed production migration, stop the release, preserve the RDS snapshot, and prefer a forward migration. If restoration is necessary, restore a snapshot to an isolated instance, validate the application against it, then change the managed `DATABASE_URL`; do not put a replacement credential in Git. See [deployment recovery](deployment.md#database-recovery-and-rollback).

See the [data-model diagram](diagrams/data-model.mmd).
