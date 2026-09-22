import { CfnOutput, Stack, StackProps, Tags } from "aws-cdk-lib";
import { Vpc, SubnetType, SecurityGroup, Port, Peer } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export class NetworkStack extends Stack {
  readonly vpc: Vpc;
  readonly applicationSecurityGroup: SecurityGroup;
  readonly databaseSecurityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, environment: string, props?: StackProps) {
    super(scope, id, props);
    this.vpc = new Vpc(this, "Vpc", {
      vpcName: `career-platform-${environment}`,
      maxAzs: 2,
      natGateways: environment === "production" ? 1 : 0,
      subnetConfiguration: [
        { name: "public", subnetType: SubnetType.PUBLIC, cidrMask: 24 },
        { name: "application", subnetType: environment === "production" ? SubnetType.PRIVATE_WITH_EGRESS : SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
        { name: "database", subnetType: SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    this.applicationSecurityGroup = new SecurityGroup(this, "ApplicationSecurityGroup", { vpc: this.vpc, description: "Application runtime security group", allowAllOutbound: true });
    this.databaseSecurityGroup = new SecurityGroup(this, "DatabaseSecurityGroup", { vpc: this.vpc, description: "Database security group", allowAllOutbound: false });
    this.databaseSecurityGroup.addIngressRule(this.applicationSecurityGroup, Port.tcp(5432), "Application to database only");
    Tags.of(this.vpc).add("Environment", environment);
    Tags.of(this.vpc).add("Name", `career-platform-${environment}`);
    new CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
    new CfnOutput(this, "ApplicationSecurityGroupId", { value: this.applicationSecurityGroup.securityGroupId });
    new CfnOutput(this, "DatabaseSecurityGroupId", { value: this.databaseSecurityGroup.securityGroupId });
  }
}
