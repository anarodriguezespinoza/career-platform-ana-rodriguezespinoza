import { App } from "aws-cdk-lib";
import { DataStack } from "../lib/data-stack";
import { IdentityStack } from "../lib/identity-stack";
import { NetworkStack } from "../lib/network-stack";
import { ObservabilityStack } from "../lib/observability-stack";
import { StorageStack } from "../lib/storage-stack";

export type Environment = "development" | "production";

export function createCareerPlatform(app: App, environment: Environment, sesFromEmail: string): void {
  if (!sesFromEmail.trim()) throw new Error("SES sender email is required via CDK context sesFromEmail or SES_FROM_EMAIL");
  const stackProps = { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION } };
  const network = new NetworkStack(app, `CareerPlatformNetwork-${environment}`, environment, stackProps);
  const storage = new StorageStack(app, `CareerPlatformStorage-${environment}`, environment, stackProps);
  new DataStack(app, `CareerPlatformData-${environment}`, environment, network, storage.applicationRole, stackProps);
  new IdentityStack(app, `CareerPlatformIdentity-${environment}`, environment, sesFromEmail, stackProps);
  new ObservabilityStack(app, `CareerPlatformObservability-${environment}`, environment, stackProps);
}

function readEnvironment(app: App): Environment {
  const value = app.node.tryGetContext("environment") ?? "development";
  if (value !== "development" && value !== "production") throw new Error("CDK context environment must be development or production");
  return value;
}

if (require.main === module) {
  const app = new App();
  const sesFromEmail = app.node.tryGetContext("sesFromEmail") ?? process.env.SES_FROM_EMAIL;
  if (typeof sesFromEmail !== "string" || !sesFromEmail.trim()) {
    throw new Error("CDK context sesFromEmail or SES_FROM_EMAIL is required");
  }
  createCareerPlatform(app, readEnvironment(app), sesFromEmail);
}
