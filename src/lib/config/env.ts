type NodeEnvironment = "development" | "test" | "production";

export type AppEnv = {
  nodeEnv: NodeEnvironment;
  databaseUrl: string;
  cognitoIssuer: string;
  cognitoClientId: string;
  cognitoAdminSubject: string | undefined;
  cognitoAdminEmails: string[];
  snapshotBucket: string;
  sesFromEmail: string;
  sesToEmail: string;
};

const requiredVariables = {
  DATABASE_URL: "databaseUrl",
  COGNITO_ISSUER: "cognitoIssuer",
  COGNITO_CLIENT_ID: "cognitoClientId",
  S3_SNAPSHOT_BUCKET: "snapshotBucket",
  SES_FROM_EMAIL: "sesFromEmail",
  SES_TO_EMAIL: "sesToEmail",
} as const;

export class EnvironmentConfigurationError extends Error {
  constructor(missingVariables: string[]) {
    super(
      `Missing required environment variables: ${missingVariables.join(", ")}`,
    );
    this.name = "EnvironmentConfigurationError";
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const nodeEnv = source.NODE_ENV ?? "development";
  const missingVariables = Object.keys(requiredVariables).filter(
    (variable) => !source[variable],
  );

  if (missingVariables.length > 0) {
    throw new EnvironmentConfigurationError(missingVariables);
  }

  return {
    nodeEnv: normalizeNodeEnvironment(nodeEnv),
    databaseUrl: source.DATABASE_URL!,
    cognitoIssuer: source.COGNITO_ISSUER!,
    cognitoClientId: source.COGNITO_CLIENT_ID!,
    cognitoAdminSubject: source.COGNITO_ADMIN_SUBJECT,
    cognitoAdminEmails: (source.COGNITO_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    snapshotBucket: source.S3_SNAPSHOT_BUCKET!,
    sesFromEmail: source.SES_FROM_EMAIL!,
    sesToEmail: source.SES_TO_EMAIL!,
  };
}

function normalizeNodeEnvironment(value: string): NodeEnvironment {
  if (value === "development" || value === "test" || value === "production") {
    return value;
  }

  throw new EnvironmentConfigurationError(["NODE_ENV"]);
}
