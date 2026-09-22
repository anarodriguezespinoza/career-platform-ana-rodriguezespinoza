const required = [
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD",
  "E2E_FALLBACK_BASE_URL",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    `Release E2E prerequisites missing: ${missing.join(", ")}. Configure development-only Cognito credentials and a fallback deployment; no release E2E scenarios may be skipped.`,
  );
  process.exit(1);
}

console.log("Release E2E prerequisites are configured.");
