import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { createCareerPlatform } from "../../infra/bin/career-platform";

function templatesFor(environment: "development" | "production") {
  const app = new App({ context: { environment } });
  createCareerPlatform(app, environment);
  return app.node
    .findAll()
    .filter((node) => node instanceof Object && "templateOptions" in node)
    .map((node) => Template.fromStack(node as never));
}

describe("career platform CDK", () => {
  it.each(["development", "production"] as const)("synthesizes isolated %s resources", (environment) => {
    const templates = templatesFor(environment);
    expect(templates.length).toBe(5);
    const serialized = JSON.stringify(templates);
    expect(serialized).toContain(environment);
  });

  it("places the database in private subnets and limits ingress", () => {
    const [network, data] = templatesFor("development");
    network.hasResourceProperties("AWS::EC2::Subnet", {
      Tags: Match.arrayWith([{ Key: "aws-cdk:subnet-name", Value: "database" }]),
    });
    data.hasResourceProperties("AWS::RDS::DBInstance", {
      StorageEncrypted: true,
      PubliclyAccessible: false,
    });
    network.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      IpProtocol: "tcp",
      FromPort: 5432,
      ToPort: 5432,
    });
  });

  it("encrypts and privatizes snapshot storage", () => {
    const [, , , storage] = templatesFor("development");
    storage.hasResourceProperties("AWS::S3::Bucket", {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [{
          ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" },
        }],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      VersioningConfiguration: { Status: "Enabled" },
    });
  });

  it("defines owner identity, SES identity, retained logs, and safe outputs", () => {
    const [, , identity, storage, observability] = templatesFor("production");
    identity.resourceCountIs("AWS::Cognito::UserPool", 1);
    identity.resourceCountIs("AWS::Cognito::UserPoolClient", 1);
    identity.resourceCountIs("AWS::SES::EmailIdentity", 1);
    observability.resourceCountIs("AWS::Logs::LogGroup", 3);
    expect(JSON.stringify(observability.toJSON())).toContain("RetentionInDays");
    for (const template of [identity, storage, observability]) {
      const output = JSON.stringify(template.toJSON());
      expect(output).not.toMatch(/password|secretString|SecretValue|DATABASE_URL=|AKIA[0-9A-Z]{16}/i);
    }
  });
});
