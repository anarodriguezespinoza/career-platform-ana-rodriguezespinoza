# Personal Resume and Career Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public, database-backed resume and portfolio site with a protected single-owner admin dashboard, safe published-content fallback, contact inquiries, generated PDF resumes, and repeatable AWS deployment.

**Architecture:** Use one Next.js App Router application written in TypeScript. Public route handlers read published records through Prisma and fall back to an S3-backed published snapshot when live reads fail; authenticated admin route handlers and server actions require verified Cognito tokens and never use the fallback for writes. AWS CDK defines the VPC, RDS PostgreSQL, Cognito, SES, S3, logging, and environment configuration, while Amplify Hosting builds and serves the Next.js application.

**Tech Stack:** Next.js App Router, TypeScript, React, Tailwind CSS with custom design tokens, Prisma, PostgreSQL on Amazon RDS, AWS Amplify Auth with Amazon Cognito, Amazon SES, Amazon S3, `@react-pdf/renderer`, AWS CDK, Vitest, Testing Library, and Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-personal-resume-career-platform-design.md`

## Global Constraints

- The first release is a resume and portfolio website, not a complete career marketplace or social network.
- Public requests can read published public content only; drafts, private inquiry notes, account information, and administrative data must never be exposed through public endpoints.
- Every admin read and write operation requires authentication and authorization.
- Public profile, experience, project, skills, and resume pages must remain visible through the latest safe published snapshot when a live database read fails.
- The fallback must contain published content only and must never include drafts, private inquiry data, admin information, or private notes.
- Admin actions, contact-inquiry storage, publishing changes, and other writes require a healthy database and must show a clear temporary error instead of pretending the change succeeded.
- Contact fields are validated on the server, contact submissions are rate-limited, and inquiry data has manual deletion capability.
- Database credentials, API keys, and email credentials are stored in managed environment configuration, never committed to the repository.
- A failed email notification must preserve a successfully stored inquiry and record the notification failure for later review.
- Publishing must fail safely if required content is invalid.
- The public fallback must identify itself in logs and must fail clearly if no published snapshot has ever been created.
- Inquiry retention is manual deletion only; no automatic expiry is implemented in the first release.
- Development and production use separate configuration, migrations are repeatable, and deployment includes health checks and a documented rollback/recovery procedure.

---

## File and Responsibility Map

The implementation should create these focused units rather than placing all behavior in route files:

- `src/app/(public)/...`: public pages, metadata, not-found behavior, and fallback-aware view composition.
- `src/app/admin/...`: authenticated dashboard screens for editing, previewing, publishing, inquiries, and resume generation.
- `src/app/api/...`: narrow HTTP boundaries for contact submission, health, public project details, and admin operations that need API access.
- `src/components/`: reusable public and admin UI components.
- `src/domain/content/`: publication-state rules, ordering, validation, and public projection types.
- `src/domain/inquiries/`: contact validation, rate limiting, storage, and notification orchestration.
- `src/domain/resume/`: published resume projection and PDF document definition.
- `src/lib/db/`: Prisma client and database repositories.
- `src/lib/fallback/`: safe snapshot schema, S3 storage, generation, loading, and source-status metadata.
- `src/lib/auth/`: Cognito configuration, token verification, and admin authorization.
- `src/lib/email/`: SES adapter and notification result types.
- `src/lib/config/`: environment parsing with separate development and production requirements.
- `prisma/schema.prisma` and `prisma/migrations/`: relational schema and migration history.
- `infra/`: AWS CDK application and stacks.
- `tests/`: unit, integration, contract, and end-to-end tests organized by behavior.
- `docs/architecture.md`, `docs/database.md`, `docs/deployment.md`, and `docs/glossary.md`: learning-oriented project documentation.

### Task 1: Scaffold the Next.js application and engineering baseline

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `src/lib/config/env.ts`
- Create: `vitest.config.ts`, `playwright.config.ts`
- Create: `.env.example`
- Create: `README.md`
- Test: `tests/config/env.test.ts`

**Interfaces:**
- Produces `env`: a parsed configuration object with typed values for `DATABASE_URL`, Cognito issuer/client values, S3 snapshot bucket, SES sender/recipient, and runtime environment.
- Produces npm scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, and `test:e2e`.

- [ ] **Step 1: Write the environment parser test**

  Test that a complete development environment parses, a missing required production secret throws a named configuration error, and no parser result contains a secret in an error message.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm test -- tests/config/env.test.ts`

  Expected: FAIL because the Next.js project and `env` parser do not exist.

- [ ] **Step 3: Scaffold the application and implement the baseline**

  Create the Next.js TypeScript app, configure Tailwind, add strict TypeScript settings, define the scripts above, implement `src/lib/config/env.ts` with server-only parsing, and add a minimal semantic landing page. Keep `.env.example` variable names only; do not add real values.

- [ ] **Step 4: Run the baseline checks**

  Run: `npm test -- tests/config/env.test.ts && npm run lint && npm run typecheck`

  Expected: PASS for the focused test, lint, and type checking.

- [ ] **Step 5: Commit the scaffold**

  ```bash
  git add package.json tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts src tests/config .env.example README.md
  git commit -m "chore: scaffold resume platform application"
  ```

**Done looks like:** A strict Next.js application starts locally, validates configuration without leaking secrets, and has working lint, typecheck, unit-test, and E2E-test commands.

**Check:** Run `npm run lint && npm run typecheck && npm test -- tests/config/env.test.ts`; then run `npm run dev` and confirm `/` returns the starter page.

### Task 2: Define the relational content and inquiry schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `src/lib/db/client.ts`
- Create: `src/lib/db/repositories/content-repository.ts`
- Create: `src/lib/db/repositories/inquiry-repository.ts`
- Test: `tests/db/schema.test.ts`, `tests/db/repositories.test.ts`

**Interfaces:**
- `ContentRepository.listPublished(): Promise<PublicContent>`
- `ContentRepository.getPublishedProject(slug: string): Promise<PublishedProject | null>`
- `ContentRepository.getDraftContent(): Promise<EditableContent>`
- `InquiryRepository.create(input: CreateInquiryInput): Promise<Inquiry>`
- `InquiryRepository.list(filters: InquiryFilters): Promise<PrivateInquiry[]>`
- `InquiryRepository.updateStatus(id: string, status: InquiryStatus): Promise<PrivateInquiry>`
- `InquiryRepository.updateNotes(id: string, notes: string): Promise<PrivateInquiry>`
- `InquiryRepository.delete(id: string): Promise<void>`

- [ ] **Step 1: Write schema and repository contract tests**

  Assert that publication states are `DRAFT`, `PUBLISHED`, and `ARCHIVED`; projects have unique slugs; ordered records sort by `displayOrder` then stable identifier; inquiries include private notes, status, timestamps, and notification status; and repository methods never return draft records from public queries.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npm test -- tests/db/schema.test.ts tests/db/repositories.test.ts`

  Expected: FAIL because Prisma models and repositories do not exist.

- [ ] **Step 3: Implement the Prisma schema and repositories**

  Add `Profile`, `Experience`, `Project`, `ProjectTechnology`, `Skill`, `ResumeSettings`, and `ContactInquiry` models with stable IDs, timestamps, publication state, explicit ordering where applicable, unique project slugs, and indexes for public queries. Use Prisma transactions for inquiry creation and status/notes updates. Keep authentication credentials out of Prisma; Cognito owns the admin identity.

- [ ] **Step 4: Add deterministic seed data**

  Seed one profile, representative experience/project/skill records, resume settings, and no inquiries. Mark only intended public records as published. Make the seed idempotent by using stable identifiers.

- [ ] **Step 5: Run migration, repository, and type checks**

  Run: `npx prisma validate && npx prisma generate && npm test -- tests/db/schema.test.ts tests/db/repositories.test.ts && npm run typecheck`

  Expected: Prisma validation, generation, repository tests, and type checking pass.

- [ ] **Step 6: Commit the data layer**

  ```bash
  git add prisma src/lib/db tests/db
  git commit -m "feat: add career content and inquiry data model"
  ```

**Done looks like:** The relational model expresses all first-release records, migrations can be generated and applied, and public repository methods structurally exclude drafts and private inquiry data.

**Check:** Run `npx prisma migrate dev --name initial_content_schema`, seed a local database, and run `npm test -- tests/db/schema.test.ts tests/db/repositories.test.ts`.

### Task 3: Implement publication rules and the safe public snapshot

**Files:**
- Create: `src/domain/content/types.ts`
- Create: `src/domain/content/publication.ts`
- Create: `src/lib/fallback/snapshot-schema.ts`
- Create: `src/lib/fallback/snapshot-store.ts`
- Create: `src/lib/fallback/snapshot-service.ts`
- Create: `src/lib/fallback/source-status.ts`
- Test: `tests/domain/publication.test.ts`, `tests/fallback/snapshot-service.test.ts`

**Interfaces:**
- `buildPublicContent(records: EditableContent): PublicContent`
- `validatePublishableContent(records: EditableContent): ValidationResult`
- `createSnapshot(content: PublicContent): PublishedSnapshot`
- `snapshotStore.read(): Promise<PublishedSnapshot | null>`
- `snapshotStore.write(snapshot: PublishedSnapshot): Promise<void>`
- `readPublicContent(loadLive: () => Promise<PublicContent>): Promise<{ content: PublicContent; source: "database" | "snapshot" }>`

- [ ] **Step 1: Write publication and fallback tests**

  Cover draft and archived exclusion, display ordering, required profile/project fields, snapshot rejection when private fields are present, successful live reads, database failure with an existing snapshot, and database failure with no snapshot producing an explicit unavailable error. Verify fallback use emits a structured `public_content_fallback` log event.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run: `npm test -- tests/domain/publication.test.ts tests/fallback/snapshot-service.test.ts`

  Expected: FAIL because the publication and snapshot modules do not exist.

- [ ] **Step 3: Implement the pure publication projection**

  Define public types that contain only published profile, experience, projects, skills, and resume data. Validate required publishable fields before publishing, sort records deterministically, and reject snapshots containing inquiry, notes, admin, or draft fields.

- [ ] **Step 4: Implement the S3 snapshot adapter and fallback service**

  Store one versioned JSON snapshot under a configured S3 key, validate it on read, include `generatedAt` and schema version, log whether content came from the database or snapshot, and throw a typed `PublicContentUnavailableError` when no safe source exists. Do not let this service handle writes to the database.

- [ ] **Step 5: Run focused tests and type checks**

  Run: `npm test -- tests/domain/publication.test.ts tests/fallback/snapshot-service.test.ts && npm run typecheck`

  Expected: PASS, including the no-snapshot failure case.

- [ ] **Step 6: Commit the public projection and fallback**

  ```bash
  git add src/domain/content src/lib/fallback tests/domain tests/fallback
  git commit -m "feat: add published content fallback"
  ```

**Done looks like:** Public content has an explicit safe projection, database failures serve the latest validated published snapshot, and no snapshot is treated as a successful response.

**Check:** Run the focused tests and inspect the structured log assertion for both `"database"` and `"snapshot"` source values.

### Task 4: Add Cognito authentication and admin authorization

**Files:**
- Create: `src/lib/auth/cognito.ts`
- Create: `src/lib/auth/require-admin.ts`
- Create: `src/components/auth/sign-in-form.tsx`
- Create: `src/app/sign-in/page.tsx`
- Create: `src/app/api/auth/session/route.ts`
- Create: `src/middleware.ts`
- Test: `tests/auth/require-admin.test.ts`, `tests/auth/session-route.test.ts`

**Interfaces:**
- `verifyCognitoAccessToken(token: string): Promise<AdminIdentity>`
- `requireAdmin(request: Request): Promise<AdminIdentity>`
- `AdminIdentity = { subject: string; email: string }`

- [ ] **Step 1: Write authentication boundary tests**

  Verify valid issuer, audience, signature, and expiry are required; invalid credentials return a generic unauthorized response; protected routes cannot distinguish nonexistent users from incorrect credentials; and public routes remain accessible without a token.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npm test -- tests/auth/require-admin.test.ts tests/auth/session-route.test.ts`

  Expected: FAIL because Cognito verification and route protection do not exist.

- [ ] **Step 3: Implement server-side Cognito verification**

  Configure AWS Amplify Auth for the browser sign-in form, verify server tokens against the configured Cognito issuer/JWKS, map only subject and email into `AdminIdentity`, and require the configured single-admin subject or email allowlist. Never log access tokens.

- [ ] **Step 4: Protect admin navigation and APIs**

  Add middleware for early redirects on admin pages and call `requireAdmin` again inside every admin route/action so authorization does not depend on middleware alone. Return generic `401`/`403` responses and a safe sign-in error message.

- [ ] **Step 5: Run authentication tests**

  Run: `npm test -- tests/auth/require-admin.test.ts tests/auth/session-route.test.ts && npm run typecheck`

  Expected: PASS with no credential contents in captured logs or response bodies.

- [ ] **Step 6: Commit authentication**

  ```bash
  git add src/lib/auth src/components/auth src/app/sign-in src/app/api/auth src/middleware.ts tests/auth
  git commit -m "feat: add Cognito admin authentication"
  ```

**Done looks like:** A single configured Cognito owner can sign in, every admin boundary verifies authorization server-side, and authentication failures reveal no sensitive account information.

**Check:** Run the focused tests with valid, expired, wrong-issuer, and missing-token fixtures; manually confirm an unauthenticated request to `/admin` redirects to `/sign-in`.

### Task 5: Build the public pages and SEO surface

**Files:**
- Create: `src/app/(public)/page.tsx`
- Create: `src/app/(public)/about/page.tsx`
- Create: `src/app/(public)/experience/page.tsx`
- Create: `src/app/(public)/projects/page.tsx`
- Create: `src/app/(public)/projects/[slug]/page.tsx`
- Create: `src/app/(public)/skills/page.tsx`
- Create: `src/app/(public)/resume/page.tsx`
- Create: `src/app/(public)/sitemap.ts`
- Create: `src/app/(public)/robots.ts`
- Create: `src/components/public/site-header.tsx`, `site-footer.tsx`, `project-card.tsx`, `source-status.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`
- Test: `tests/public/public-access.test.ts`, `tests/public/metadata.test.ts`

**Interfaces:**
- Pages consume `readPublicContent()` and receive only `PublicContent`.
- Project detail pages accept a validated `slug` and return `notFound()` for missing or archived projects.

- [ ] **Step 1: Write public access and metadata tests**

  Assert that public page loaders never call draft/private repository methods, project pages return not-found for unknown or archived slugs, metadata includes canonical URLs and social descriptions, and sitemap entries include only published routes.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npm test -- tests/public/public-access.test.ts tests/public/metadata.test.ts`

  Expected: FAIL because the public routes and components do not exist.

- [ ] **Step 3: Implement the public pages**

  Build semantic, responsive pages for the homepage, professional summary, experience, projects, project details, skills, and resume. Use Tailwind custom tokens for restrained typography, spacing, color, focus states, and responsive layout. Render a subtle source-status notice only when appropriate, without exposing infrastructure details.

- [ ] **Step 4: Add SEO and deliberate missing-content behavior**

  Add route metadata, Open Graph/Twitter fields, sitemap, robots rules, accessible headings, semantic lists, and `notFound()` handling. Ensure all page content comes from the published projection and uses the snapshot transparently when live reads fail.

- [ ] **Step 5: Run checks**

  Run: `npm test -- tests/public/public-access.test.ts tests/public/metadata.test.ts && npm run lint && npm run typecheck`

  Expected: PASS.

- [ ] **Step 6: Commit the public experience**

  ```bash
  git add src/app src/components/public src/components tests/public
  git commit -m "feat: add public resume and portfolio pages"
  ```

**Done looks like:** Visitors can navigate a polished, accessible homepage, resume, experience, skills, and project portfolio; published content is visible during database outages; archived/missing projects return deliberate 404 responses.

**Check:** Start the app with a seeded database, visit each public route, then force the live content repository to fail and confirm the same pages render from the snapshot.

### Task 6: Implement admin editing, preview, and publishing

**Files:**
- Create: `src/domain/content/admin-service.ts`
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/content/page.tsx`
- Create: `src/app/admin/content/[type]/[id]/page.tsx`
- Create: `src/app/admin/preview/page.tsx`
- Create: `src/app/admin/actions.ts`
- Create: `src/components/admin/content-form.tsx`, `publish-controls.tsx`, `preview-frame.tsx`
- Modify: `src/lib/db/repositories/content-repository.ts`, `src/lib/fallback/snapshot-service.ts`
- Test: `tests/admin/content-actions.test.ts`, `tests/admin/publishing.test.ts`

**Interfaces:**
- `saveDraft(input: SaveDraftInput, actor: AdminIdentity): Promise<EditableContent>`
- `publishContent(actor: AdminIdentity): Promise<PublishResult>`
- `unpublishRecord(type: ContentType, id: string, actor: AdminIdentity): Promise<void>`
- `archiveRecord(type: ContentType, id: string, actor: AdminIdentity): Promise<void>`
- `previewDraft(actor: AdminIdentity): Promise<PreviewContent>`

- [ ] **Step 1: Write admin action tests**

  Verify unauthenticated calls fail, draft saves do not alter public content, invalid required fields prevent publishing, successful publishing updates the snapshot only after the database transaction succeeds, and database failures return a temporary error without a success-shaped result.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npm test -- tests/admin/content-actions.test.ts tests/admin/publishing.test.ts`

  Expected: FAIL because admin actions and screens do not exist.

- [ ] **Step 3: Implement transactional content actions**

  Validate all profile, experience, project, and skill inputs server-side; save drafts with explicit publication state; enforce display order and featured flags; publish only valid required content; update the snapshot after a successful transaction; and log actor subject plus operation without content secrets.

- [ ] **Step 4: Build admin screens and preview**

  Add authenticated navigation, forms for each editable record, draft list, preview route using draft projection, publish/unpublish/archive controls, and clear database-unavailable errors. Do not reuse public loaders for draft preview.

- [ ] **Step 5: Run checks**

  Run: `npm test -- tests/admin/content-actions.test.ts tests/admin/publishing.test.ts && npm run lint && npm run typecheck`

  Expected: PASS.

- [ ] **Step 6: Commit admin content management**

  ```bash
  git add src/domain/content src/app/admin src/components/admin src/lib/db src/lib/fallback tests/admin
  git commit -m "feat: add admin content editing and publishing"
  ```

**Done looks like:** The owner can create/edit drafts, preview them privately, publish valid content, unpublish/archive records, order/feature content, and refresh the safe snapshot; no write reports success while the database is unavailable.

**Check:** In the admin UI, edit a draft, verify it is absent publicly, preview it, publish it, and verify it appears publicly only after publishing.

### Task 7: Add contact form, rate limiting, inquiry management, and SES notifications

**Files:**
- Create: `src/domain/inquiries/validation.ts`
- Create: `src/domain/inquiries/rate-limit.ts`
- Create: `src/domain/inquiries/service.ts`
- Create: `src/lib/email/ses.ts`
- Create: `src/app/(public)/contact/page.tsx`
- Create: `src/app/api/contact/route.ts`
- Create: `src/app/admin/inquiries/page.tsx`
- Create: `src/app/admin/inquiries/[id]/page.tsx`
- Create: `src/app/admin/inquiries/actions.ts`
- Create: `src/components/public/contact-form.tsx`
- Create: `src/components/admin/inquiry-table.tsx`
- Test: `tests/inquiries/validation.test.ts`, `tests/inquiries/service.test.ts`, `tests/inquiries/contact-route.test.ts`

**Interfaces:**
- `validateContactInput(input: unknown): ContactInput`
- `submitInquiry(input: ContactInput, context: RequestContext): Promise<SubmissionResult>`
- `sendInquiryNotification(inquiry: InquiryNotification): Promise<NotificationResult>`
- `deleteInquiry(id: string, actor: AdminIdentity): Promise<void>`

- [ ] **Step 1: Write inquiry tests**

  Cover invalid email/name/message/opportunity type, server-side normalization, repeated submissions from one client being rate-limited, private storage, successful storage plus notification, notification failure preserving the inquiry and recording failure status, generic public errors, admin status/notes updates, and manual deletion.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npm test -- tests/inquiries/validation.test.ts tests/inquiries/service.test.ts tests/inquiries/contact-route.test.ts`

  Expected: FAIL because inquiry validation, storage, and routes do not exist.

- [ ] **Step 3: Implement validation and rate limiting**

  Validate on the server with a typed schema, normalize safe display fields, reject oversized messages and malformed addresses, and use a bounded rate-limit adapter keyed by client identity. Return `429` with a retry-safe message without exposing storage details.

- [ ] **Step 4: Implement storage-first notification orchestration**

  Persist the inquiry in a transaction before calling SES. If SES fails, update notification status/error metadata, log the failure without message contents, and return a response that confirms receipt without claiming email delivery.

- [ ] **Step 5: Build public and admin inquiry screens**

  Add accessible contact form states, private admin list/detail pages, status controls, private notes, and a delete action requiring authentication and confirmation. Never include private notes or inquiries in public loaders, snapshots, sitemap output, or logs.

- [ ] **Step 6: Run checks and commit**

  Run: `npm test -- tests/inquiries/validation.test.ts tests/inquiries/service.test.ts tests/inquiries/contact-route.test.ts && npm run lint && npm run typecheck`

  ```bash
  git add src/domain/inquiries src/lib/email src/app/'(public)'/contact src/app/api/contact src/app/admin/inquiries src/components tests/inquiries
  git commit -m "feat: add contact inquiries and email notification"
  ```

**Done looks like:** Visitors can submit a validated, rate-limited inquiry; the owner can review, annotate, update status, and manually delete it; SES failures never lose stored inquiries or falsely report delivery.

**Check:** Submit valid and invalid forms, exceed the rate limit, force SES to fail, and verify the inquiry remains visible with a notification-failure status.

### Task 8: Generate the published PDF resume

**Files:**
- Create: `src/domain/resume/resume-data.ts`
- Create: `src/domain/resume/resume-document.tsx`
- Create: `src/domain/resume/generate-pdf.ts`
- Create: `src/app/api/resume/route.ts`
- Create: `src/app/admin/resume/page.tsx`
- Create: `src/app/admin/resume/actions.ts`
- Test: `tests/resume/resume-data.test.ts`, `tests/resume/generate-pdf.test.ts`

**Interfaces:**
- `getPublishedResumeData(): Promise<PublishedResumeData>`
- `generateResumePdf(data: PublishedResumeData): Promise<Uint8Array>`
- `GET /api/resume`: returns `application/pdf` from published data only.

- [ ] **Step 1: Write PDF tests**

  Assert that only published records selected by `ResumeSettings` enter the projection, representative data produces a non-empty PDF with the expected content markers, drafts never appear, and the admin generation action requires authorization.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npm test -- tests/resume/resume-data.test.ts tests/resume/generate-pdf.test.ts`

  Expected: FAIL because the resume projection and PDF document do not exist.

- [ ] **Step 3: Implement the resume projection and document**

  Map published profile, selected experience/projects/skills, and links into a stable `PublishedResumeData` type. Define the PDF with `@react-pdf/renderer`, readable typography, page-break-safe sections, and no private/admin fields.

- [ ] **Step 4: Add public download and admin generation**

  Return a streamed PDF for public download, add an authenticated admin preview/generation action, and return a clear temporary error if required published data or the database is unavailable. Do not generate a PDF from the fallback unless the implementation explicitly has a validated snapshot resume projection.

- [ ] **Step 5: Run checks and commit**

  Run: `npm test -- tests/resume/resume-data.test.ts tests/resume/generate-pdf.test.ts && npm run typecheck`

  ```bash
  git add src/domain/resume src/app/api/resume src/app/admin/resume tests/resume
  git commit -m "feat: generate published resume PDF"
  ```

**Done looks like:** Visitors can download a PDF generated from published structured data, and the owner can generate the current published resume from the admin area without draft or private data leakage.

**Check:** Download the PDF from the public resume page, extract text in the test fixture, and verify changing a draft does not change the downloaded document until publication.

### Task 9: Add health checks, observability, and failure-safe request behavior

**Files:**
- Create: `src/app/api/health/route.ts`
- Create: `src/lib/observability/logger.ts`
- Create: `src/lib/observability/request-context.ts`
- Modify: `src/lib/fallback/snapshot-service.ts`, `src/domain/inquiries/service.ts`, `src/domain/content/admin-service.ts`
- Test: `tests/health/health-route.test.ts`, `tests/observability/logging.test.ts`

**Interfaces:**
- `GET /api/health`: returns `{ status: "ok" | "degraded" | "unavailable"; database: "up" | "down"; publicSource: "database" | "snapshot" | "none" }`.
- `logger.info(event, fields)`, `logger.warn(event, fields)`, and `logger.error(event, fields)` redact secrets and inquiry message contents.

- [ ] **Step 1: Write health and logging tests**

  Verify healthy database status, degraded snapshot-backed status, unavailable/no-snapshot status, request correlation IDs, redaction of tokens and credentials, and absence of raw inquiry messages from captured logs.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npm test -- tests/health/health-route.test.ts tests/observability/logging.test.ts`

  Expected: FAIL because health and structured logging do not exist.

- [ ] **Step 3: Implement health and structured logging**

  Probe the database with a bounded timeout, probe snapshot availability without loading private data, classify live/degraded/unavailable states, add request IDs, and centralize redaction before logs are emitted.

- [ ] **Step 4: Wire failure paths**

  Ensure public database failures log and use the snapshot, admin/write failures log and return temporary errors, publish failures do not refresh the snapshot, and SES failures retain inquiries with notification status.

- [ ] **Step 5: Run checks and commit**

  Run: `npm test -- tests/health/health-route.test.ts tests/observability/logging.test.ts && npm run lint && npm run typecheck`

  ```bash
  git add src/app/api/health src/lib/observability src/lib/fallback src/domain/inquiries src/domain/content tests/health tests/observability
  git commit -m "feat: add health signals and safe structured logging"
  ```

**Done looks like:** Operators can distinguish live, degraded snapshot, and unavailable operation, while logs support diagnosis without exposing credentials or inquiry contents.

**Check:** Run the health tests with database up/down and snapshot present/absent fixtures, then inspect captured logs for redaction.

### Task 10: Define AWS infrastructure with CDK and Amplify deployment

**Files:**
- Create: `infra/bin/career-platform.ts`
- Create: `infra/lib/network-stack.ts`
- Create: `infra/lib/data-stack.ts`
- Create: `infra/lib/identity-stack.ts`
- Create: `infra/lib/storage-stack.ts`
- Create: `infra/lib/observability-stack.ts`
- Create: `infra/cdk.json`, `infra/package.json`, `infra/tsconfig.json`
- Create: `amplify.yml`
- Create: `.github/workflows/ci.yml`
- Modify: `.env.example`, `README.md`
- Test: `tests/infra/cdk-synth.test.ts`

**Interfaces:**
- CDK context selects `development` or `production`.
- Stack outputs provide RDS connection secret reference, Cognito issuer/client identifiers, S3 snapshot bucket/key, SES sender identity, and log group names without outputting secret values.

- [ ] **Step 1: Write CDK synthesis tests**

  Assert separate environment naming, private RDS subnets/security groups, application-to-database-only ingress, encrypted S3 bucket with blocked public access, Cognito user pool, SES identity configuration, log retention, and no plaintext secret values in synthesized templates.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npm --prefix infra test -- tests/infra/cdk-synth.test.ts`

  Expected: FAIL because the CDK app and stacks do not exist.

- [ ] **Step 3: Implement CDK stacks**

  Define a VPC with private database subnets, RDS PostgreSQL with encryption and backups, Cognito user pool for one owner, an encrypted private S3 bucket for snapshots/media, SES identity configuration, CloudWatch log groups, and least-privilege IAM. Keep development and production context separate.

- [ ] **Step 4: Configure Amplify builds and CI**

  Add `amplify.yml` to install dependencies, run Prisma generation/migrations according to environment policy, run lint/typecheck/unit tests, and build Next.js. Add GitHub Actions for pull-request checks and CDK synthesis. Do not place credentials in repository files; use managed environment secrets.

- [ ] **Step 5: Run synthesis and checks**

  Run: `npm --prefix infra run build && npx cdk synth -c environment=development && npm run lint && npm run typecheck && npm test`

  Expected: CDK synthesis, application checks, and all tests pass.

- [ ] **Step 6: Commit infrastructure**

  ```bash
  git add infra amplify.yml .github/workflows/ci.yml .env.example README.md
  git commit -m "feat: define AWS deployment infrastructure"
  ```

**Done looks like:** Development and production AWS resources are reproducibly defined, network access is least-privilege, secrets are externalized, and Amplify/CI can build the application using repeatable checks.

**Check:** Run CDK synthesis for both environment contexts and inspect the template for private database placement, encrypted storage, restricted security groups, and absence of secret values.

### Task 11: Document architecture, database relationships, deployment, and recovery

**Files:**
- Create: `docs/architecture.md`
- Create: `docs/database.md`
- Create: `docs/deployment.md`
- Create: `docs/glossary.md`
- Create: `docs/diagrams/system-architecture.mmd`
- Create: `docs/diagrams/data-model.mmd`
- Modify: `README.md`

- [ ] **Step 1: Document the request and failure flows**

  Explain browser → Next.js → Prisma/RDS, Cognito authentication, SES notification, S3 snapshot fallback, and which operations are allowed in degraded mode. Include the exact health statuses and source values implemented in Task 9.

- [ ] **Step 2: Document the data model and privacy boundaries**

  Describe each Prisma model, relationships, publication states, public projection boundary, private inquiry fields, manual deletion policy, and migration workflow.

- [ ] **Step 3: Document deployment and recovery**

  Provide prerequisites, environment configuration, CDK bootstrap/deploy commands, Prisma migration commands, Amplify setup, health verification, snapshot recovery, database rollback guidance, and the rule that production secrets are managed outside Git.

- [ ] **Step 4: Add the glossary and diagrams**

  Define terms including publication state, snapshot fallback, server action, Cognito, RDS, SES, S3, migration, and least privilege. Keep Mermaid diagrams synchronized with the implemented components and relationships.

- [ ] **Step 5: Check documentation**

  Run: `git grep -nE 'TBD|<PLACEHOLDER>|CHANGE_ME' -- docs README.md`

  Expected: no placeholder output. Manually follow the deployment commands against a development environment and confirm each referenced path/script exists.

- [ ] **Step 6: Commit documentation**

  ```bash
  git add docs README.md
  git commit -m "docs: explain architecture deployment and data model"
  ```

**Done looks like:** The owner can explain every major component, relationship, security boundary, deployment step, and recovery action using repository documentation and diagrams.

**Check:** A fresh engineer can follow `docs/deployment.md` against development configuration and reach `/api/health` with a healthy or explicitly degraded status.

### Task 12: Complete end-to-end verification and release gate

**Files:**
- Create: `tests/e2e/admin-publish.spec.ts`
- Create: `tests/e2e/contact.spec.ts`
- Create: `tests/e2e/public-fallback.spec.ts`
- Modify: `playwright.config.ts`, `.github/workflows/ci.yml`

- [ ] **Step 1: Write the end-to-end scenarios**

  Cover signing in, editing a draft, previewing it, publishing it, viewing the public result, submitting a contact inquiry, viewing/updating/deleting it as admin, and serving public content from the snapshot when the database read is unavailable.

- [ ] **Step 2: Run E2E tests against a configured development environment**

  Run: `npm run test:e2e`

  Expected: all scenarios pass without relying on production data or credentials committed to the repository.

- [ ] **Step 3: Run the full release checks**

  Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e && npm --prefix infra run build && npx cdk synth -c environment=development`

  Expected: every command exits successfully.

- [ ] **Step 4: Verify the release checklist**

  Confirm public pages, project 404 behavior, PDF download, contact validation/rate limiting, admin authorization, draft exclusion, snapshot fallback, health status, logs, migration availability, environment separation, and recovery documentation.

- [ ] **Step 5: Commit the release gate**

  ```bash
  git add tests/e2e playwright.config.ts .github/workflows/ci.yml
  git commit -m "test: add first-release end-to-end coverage"
  ```

**Done looks like:** The complete first-release workflow passes from admin sign-in through publishing and public viewing, and the release pipeline verifies correctness, privacy, fallback behavior, and deployability.

**Check:** Run the full release command block from a clean checkout with development services configured; do not declare the release ready if any check is skipped or if a fallback test has no snapshot fixture.

## Plan Self-Review

- **Spec coverage:** Public pages, admin editing/preview/publishing, data model, authentication, contact inquiries, PDF generation, safe fallback, security/privacy, AWS deployment, health signals, tests, documentation, and manual inquiry deletion each have a dedicated task.
- **No placeholders:** Each task names concrete files, interfaces, commands, expected outcomes, and commit scope.
- **Type consistency:** `PublicContent`, `PublishedProject`, `PublishedResumeData`, `AdminIdentity`, `ContentRepository`, `InquiryRepository`, `readPublicContent`, and `generateResumePdf` are defined before later tasks consume them.
- **Scope:** This plan implements only the approved first release; public accounts, teams, job matching, CRM workflows, multiple profiles, articles, and analytics remain out of scope.
