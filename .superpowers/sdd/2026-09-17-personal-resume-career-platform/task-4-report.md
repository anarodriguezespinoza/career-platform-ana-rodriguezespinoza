# Task 4 Report: Cognito authentication and admin authorization

## Status

Implemented Cognito-backed authentication and single-admin authorization for the existing Next.js App Router application.

## Changes

- Added server-side Cognito JWT verification using the configured issuer JWKS, client ID audience, issuer, signature, and expiry checks.
- Added minimal `AdminIdentity` mapping (`subject`, `email`) and subject/email allowlist enforcement.
- Added generic unauthorized/forbidden responses without access-token logging or credential details.
- Added admin authorization helper supporting bearer tokens and the authenticated HttpOnly session cookie.
- Added `/api/auth/session`, which verifies authorization and establishes the HttpOnly token cookie.
- Added `/sign-in` and an Amplify Auth sign-in form with a safe generic failure message.
- Added middleware redirecting unauthenticated `/admin` navigation to `/sign-in`.
- Added configuration examples for admin subject/email allowlists and browser Amplify settings.
- Added auth tests for valid JWTs, invalid signatures, expiry, wrong issuer, missing credentials, generic unauthorized behavior, and authorized/unauthorized session responses.

## Verification

- `npm test -- tests/auth/require-admin.test.ts tests/auth/session-route.test.ts tests/auth/cognito.test.ts`: **PASS** (3 files, 9 tests).
- `npm run typecheck`: **PASS**.
- `npm test`: **4 unrelated failures** in `tests/db/repositories.test.ts`; the local SQLite database is missing the pre-existing `ContactInquiry` table. The remaining 25 tests pass.

## Concerns

The full suite requires the repository's SQLite test database to be migrated/seeded before repository tests can pass. This was not changed because it is outside Task 4.
