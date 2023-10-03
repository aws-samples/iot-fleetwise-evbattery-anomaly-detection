import {
  Stack,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class TimestreamRole extends Construct {
  public static getOrCreate(scope: Construct) {
    const stack = Stack.of(scope);
    const id = 'timestream-exec-role';
    return stack.node.tryFindChild(id) as TimestreamRole || new TimestreamRole(stack, id);
  }

  public readonly role: iam.Role;
  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('iotfleetwise.amazonaws.com')
    });

    this.role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'timestream:DescribeEndpoints',
        'timestream:DescribeDatabase',
        'timestream:DescribeTable',
        "timestream:WriteRecords",
        "timestream:Select"
      ],
      resources: ['*'],
    }));
  }
}