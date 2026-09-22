import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, environment: string, props?: StackProps) {
    super(scope, id, props);
    const retention = environment === "production" ? RetentionDays.ONE_YEAR : RetentionDays.ONE_MONTH;
    for (const name of ["application", "audit", "health"]) {
      const group = new LogGroup(this, `${name}LogGroup`, { logGroupName: `/career-platform/${environment}/${name}`, retention, removalPolicy: environment === "production" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY });
      new CfnOutput(this, `${name}LogGroupName`, { value: group.logGroupName });
    }
  }
}
