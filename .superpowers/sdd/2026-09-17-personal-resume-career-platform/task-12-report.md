# Task 12 report

## Status

Implemented the Playwright release-gate coverage and CI wiring. The change is committed as `test: add first-release end-to-end coverage`.

## Coverage added

- `tests/e2e/admin-publish.spec.ts`: development-Cognito sign-in, draft editing, draft preview, draft exclusion from the public page, publish, and public verification.
- `tests/e2e/contact.spec.ts`: public inquiry submission plus authenticated admin viewing, status update, private-note update, and permanent deletion.
- `tests/e2e/public-fallback.spec.ts`: snapshot-source status and public rendering against a separately configured fallback deployment.
- `tests/e2e/fixtures/public-content.json`: explicit snapshot fixture used by the fallback assertion.
- `tests/e2e/support.ts`: explicit development credential contract and reusable sign-in helper.
- `playwright.config.ts`: local dev server defaults, external-server override, Chromium project settings, deterministic local SQLite/dummy service configuration, and CI retries.
- `vitest.config.ts`: excludes Playwright tests from the unit-test runner.
- `.github/workflows/ci.yml`: installs Chromium, migrates/seeds a local SQLite database, runs E2E, and uses working-directory-correct CDK synthesis commands.

No production credentials or secrets are committed. Admin scenarios require `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`; fallback coverage requires `E2E_FALLBACK_BASE_URL` pointing to a development deployment with live reads disabled and the checked-in snapshot fixture published.

## Validation

Passed:

- `npm run lint`
- `npm run typecheck`
- `npm test` — 24 files, 89 tests
- `npm run build`
- `npm --prefix infra run build`
- `npm test --prefix infra -- tests/infra/cdk-synth.test.ts` — 7 tests
- `cd infra && npx cdk synth -c environment=development -c sesFromEmail=ci@example.com`
- `npm run test:e2e -- --list` — 4 scenarios discovered
- Local `npm run test:e2e` — 1 public contact scenario passed; 3 scenarios skipped because no development Cognito credentials or fallback deployment were configured.

The credentialed admin flow and live-database-unavailable snapshot flow were not executable in this worktree because no development Cognito account or fallback deployment was available. They remain explicit, opt-in tests rather than silently using production services.

## Review-fix update

The release gate no longer skips admin or snapshot-fallback coverage. `tests/e2e/support.ts` now raises explicit prerequisite errors, and the CI E2E job runs `npm run test:e2e:preflight` with development-only `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, and `E2E_FALLBACK_BASE_URL` values sourced from GitHub Secrets/Variables. If any are absent, the job fails before Playwright instead of passing with skipped scenarios. No credential values are stored in the repository; the expected local configuration is documented in `.env.example`.

Added `tests/e2e/release-checklist.spec.ts` coverage for project 404s, published PDF headers/content, contact validation and rate limiting, and database-backed health. Existing migration and deployment/config tests remain part of the release validation and were rerun. The E2E list now contains 8 scenarios with no skip annotations.

Review-fix validation:

- `npm run test:e2e:preflight` fails clearly when the required admin/fallback configuration is absent (expected local result).
- `CI=1 DATABASE_URL=file:./dev.db npx playwright test tests/e2e/release-checklist.spec.ts` — 4 passed.
- `CI=1 npx playwright test --list` — 8 scenarios discovered, none skipped.
- `npm run lint`, `npm run typecheck`, `npm test` — 24 files, 89 tests, `npm run build` — passed.
- `npm run build --prefix infra`, `npm test --prefix infra -- tests/infra/cdk-synth.test.ts` — 7 tests passed.
- Development and production CDK synth — passed.

Credentialed Cognito admin and configured fallback deployment scenarios were not run locally because those development services/credentials are intentionally unavailable. CI now fails explicitly until they are configured.
