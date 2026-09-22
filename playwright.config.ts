import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const useExternalServer = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: useExternalServer
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          NODE_ENV: "development",
          DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
          COGNITO_ISSUER: process.env.COGNITO_ISSUER ?? "http://127.0.0.1:4010",
          COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID ?? "e2e-client",
          NEXT_PUBLIC_COGNITO_ISSUER:
            process.env.NEXT_PUBLIC_COGNITO_ISSUER ?? "http://127.0.0.1:4010",
          NEXT_PUBLIC_COGNITO_CLIENT_ID:
            process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "e2e-client",
          S3_SNAPSHOT_BUCKET: process.env.S3_SNAPSHOT_BUCKET ?? "e2e-snapshots",
          SES_FROM_EMAIL: process.env.SES_FROM_EMAIL ?? "e2e@example.com",
          SES_TO_EMAIL: process.env.SES_TO_EMAIL ?? "e2e@example.com",
          AWS_REGION: process.env.AWS_REGION ?? "us-east-1",
          AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "e2e-access-key",
          AWS_SECRET_ACCESS_KEY:
            process.env.AWS_SECRET_ACCESS_KEY ?? "e2e-secret-key",
          AWS_EC2_METADATA_DISABLED: "true",
          AWS_MAX_ATTEMPTS: "1",
        },
      },
});
