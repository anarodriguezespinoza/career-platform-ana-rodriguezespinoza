import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Credentials, DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion } from "aws-cdk-lib/aws-rds";
import { SubnetType } from "aws-cdk-lib/aws-ec2";
import { Duration } from "aws-cdk-lib";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { NetworkStack } from "./network-stack";

export class DataStack extends Stack {
  readonly databaseSecret: Secret;
  readonly database: DatabaseInstance;

  constructor(scope: Construct, id: string, environment: string, network: NetworkStack, props?: StackProps) {
    super(scope, id, props);
    this.databaseSecret = new Secret(this, "DatabaseSecret", { secretName: `career-platform/${environment}/database` });
    this.database = new DatabaseInstance(this, "Database", {
      engine: DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_16 }),
      vpc: network.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroups: [network.databaseSecurityGroup],
      credentials: Credentials.fromSecret(this.databaseSecret),
      databaseName: "career_platform",
      allocatedStorage: environment === "production" ? 20 : 10,
      maxAllocatedStorage: environment === "production" ? 100 : 30,
      storageEncrypted: true,
      backupRetention: Duration.days(environment === "production" ? 14 : 1),
      deletionProtection: environment === "production",
      publiclyAccessible: false,
      removalPolicy: environment === "production" ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
    });
    new CfnOutput(this, "DatabaseSecretArn", { value: this.databaseSecret.secretArn, exportName: `career-platform-${environment}-database-secret-arn` });
    new CfnOutput(this, "DatabaseEndpoint", { value: this.database.dbInstanceEndpointAddress });
    new CfnOutput(this, "DatabasePort", { value: this.database.dbInstanceEndpointPort });
  }
}
