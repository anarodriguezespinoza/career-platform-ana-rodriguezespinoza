# Task 2 Implementation Report

## Outcome

Implemented the relational career-content and contact-inquiry data layer with Prisma, deterministic seed data, a shared Prisma client, typed content/inquiry repositories, migrations, and contract/integration tests.

## Files changed

- `prisma/schema.prisma` — SQLite relational schema for `Profile`, `Experience`, `Project`, `ProjectTechnology`, `Skill`, `ResumeSettings`, and `ContactInquiry`; stable identifiers, timestamps, publication states, ordering, unique project slugs, and public-query indexes.
- `prisma/migrations/20260917213841_initial_content_schema/migration.sql` — initial migration.
- `prisma/migrations/migration_lock.toml` — Prisma migration provider lock.
- `prisma/seed.ts` — idempotent stable-ID seed for profile, representative experience/project/technology/skill data, and resume settings; no inquiries are seeded.
- `src/lib/db/client.ts` — singleton Prisma client with a local fallback database URL for development/test execution.
- `src/lib/db/types.ts` — publication, inquiry, and notification state constants/types.
- `src/lib/db/repositories/content-repository.ts` — published and editable content queries with structural publication filtering and deterministic ordering.
- `src/lib/db/repositories/inquiry-repository.ts` — transactional inquiry creation/status/notes updates plus filtered listing and deletion.
- `src/lib/db/repositories/index.ts` — repository exports.
- `tests/db/schema.test.ts` — schema/client contract coverage.
- `tests/db/repositories.test.ts` — public draft exclusion, ordering, editable content, inquiry creation, filtering, updates, and deletion coverage.
- `package.json`, `package-lock.json` — pinned Prisma 6.19.0, `tsx`, and Prisma seed configuration.

## Commands and results

1. `npm test -- tests/db/schema.test.ts tests/db/repositories.test.ts` (before implementation): **failed as expected** because Prisma client and database repositories did not exist.
2. `DATABASE_URL=file:./dev.db npx prisma validate`: **passed**.
3. `DATABASE_URL=file:./dev.db npx prisma generate`: **passed**, generated Prisma Client 6.19.0.
4. `DATABASE_URL=file:./dev.db npx prisma migrate dev --name initial_content_schema --skip-seed`: **passed**, created and applied the initial migration.
5. `DATABASE_URL=file:./dev.db npm test -- tests/db/schema.test.ts tests/db/repositories.test.ts`: **passed**, 2 files and 6 tests.
6. `DATABASE_URL=file:./dev.db npx prisma db seed`: **passed**.
7. `npm run typecheck`: **passed**.

## Decisions

- Used SQLite for the migration-ready local relational schema because the repository has no provisioned database service; `DATABASE_URL` remains configurable for deployment.
- Represented publication/inquiry/notification states as constrained application constants over string columns so the schema remains SQLite-compatible while preserving the required state vocabulary.
- Kept Cognito credentials out of Prisma; the schema contains only content and inquiry data.
- Public content methods apply `publicationState = PUBLISHED` in their database filters rather than filtering after retrieval.
- Ordered collections use `displayOrder` followed by a stable identifier (or technology name for project technologies).
- Inquiry creation and status/notes updates use Prisma transactions as required; notification state defaults to `PENDING`.

## Concerns

- Prisma emits a deprecation warning for the `package.json#prisma` seed configuration in future Prisma 7 releases; this implementation pins Prisma 6.19.0, where it works, and can be migrated to `prisma.config.ts` during a future Prisma major upgrade.
- `npm install` reports pre-existing React peer-dependency warnings and 8 package audit findings; no audit remediation was applied because it is outside Task 2 scope.


## Review fix report

### Fixes

- Added `publicationState` and a public-query index to `ResumeSettings`; `listPublished()` now filters settings to `PUBLISHED`, while draft/editable content remains unrestricted.
- Added deterministic `id ASC` ordering to `getPublishedProfile()` so multiple published profiles resolve consistently.
- Added regression coverage for draft/published resume settings and multiple published profiles.
- Updated the deterministic seed to mark the seeded resume settings record as `PUBLISHED`.

### Validation

- `DATABASE_URL=file:./dev.db npx prisma validate`: passed.
- `DATABASE_URL=file:./dev.db npx prisma generate`: passed.
- `DATABASE_URL=file:./dev.db npx prisma migrate dev --name publish_resume_settings --skip-seed`: passed; created and applied migration `20260917214047_publish_resume_settings`.
- `DATABASE_URL=file:./dev.db npm test -- tests/db/schema.test.ts tests/db/repositories.test.ts`: passed, 2 files and 6 tests.
- `npm run typecheck`: passed.
