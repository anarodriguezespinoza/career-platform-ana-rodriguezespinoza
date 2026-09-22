import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { EmailIdentity, Identity } from "aws-cdk-lib/aws-ses";
import { Construct } from "constructs";

export class IdentityStack extends Stack {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly emailIdentity: EmailIdentity;

  constructor(scope: Construct, id: string, environment: string, sesFromEmail: string, props?: StackProps) {
    super(scope, id, props);
    this.userPool = new UserPool(this, "OwnerUserPool", {
      userPoolName: `career-platform-${environment}-owner`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      removalPolicy: environment === "production" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    this.userPoolClient = this.userPool.addClient("WebClient", { generateSecret: false, preventUserExistenceErrors: true, authFlows: { userSrp: true } });
    this.emailIdentity = new EmailIdentity(this, "SenderIdentity", { identity: Identity.email(sesFromEmail) });
    new CfnOutput(this, "CognitoIssuer", { value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}` });
    new CfnOutput(this, "CognitoUserPoolId", { value: this.userPool.userPoolId });
    new CfnOutput(this, "CognitoClientId", { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, "SesSenderIdentity", { value: this.emailIdentity.emailIdentityArn });
  }
}
