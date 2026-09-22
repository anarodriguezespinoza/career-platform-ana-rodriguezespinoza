import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { AnyPrincipal, Effect, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class StorageStack extends Stack {
  readonly snapshotBucket: Bucket;
  readonly applicationRole: Role;

  constructor(scope: Construct, id: string, environment: string, props?: StackProps) {
    super(scope, id, props);
    this.snapshotBucket = new Bucket(this, "SnapshotBucket", {
      bucketName: undefined,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      enforceSSL: true,
      removalPolicy: environment === "production" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== "production",
    });
    this.applicationRole = new Role(this, "ApplicationRole", { assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com") });
    this.applicationRole.addToPolicy(new PolicyStatement({ effect: Effect.ALLOW, actions: ["s3:GetObject", "s3:PutObject"], resources: [this.snapshotBucket.arnForObjects("public/content.json")] }));
    this.applicationRole.addToPolicy(new PolicyStatement({ effect: Effect.ALLOW, actions: ["s3:ListBucket"], resources: [this.snapshotBucket.bucketArn], conditions: { StringLike: { "s3:prefix": ["public/*"] } } }));
    new CfnOutput(this, "SnapshotBucketName", { value: this.snapshotBucket.bucketName });
    new CfnOutput(this, "SnapshotKey", { value: "public/content.json" });
    new CfnOutput(this, "ApplicationRoleArn", { value: this.applicationRole.roleArn });
  }
}
