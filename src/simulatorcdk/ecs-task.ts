
import { App, PhysicalName, Stack } from 'aws-cdk-lib';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import {
  TaskDefinition,
  NetworkMode,
  Compatibility,
  ContainerImage,
  LogDriver,
} from 'aws-cdk-lib/aws-ecs';
import {
  ManagedPolicy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';

export interface VehicleSimulatorEcsTaskStackProps {
  readonly stackName: string;
  readonly cpu: string;
  readonly taskName: string;
  readonly ecrArn: string;
  readonly ecrTag: string;
  readonly createS3Bucket?: boolean; // If specify, a s3 bucket under the same account will be created
}

export class VehicleSimulatorEcsTaskStack extends Stack {
  public readonly s3BucketName?: string;
  constructor(
    scope: App,
    id: string,
    props: VehicleSimulatorEcsTaskStackProps,
  ) {
    super(scope, id, {
      stackName: props.stackName,
    });

    /**
     * IAM Role for EC2 instances
     */
    const ecsTaskRole = new Role(this, 'ecs-task-role', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        // S3 read access is required to download simulation file from S3 in ECS task
        // S3 write access is required to upload file from ECS task to S3.
        // We cannot specify bucket here as we le
        ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        //  Task Execution Role is required to enable cloudwatch logging
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy',
        ),
      ],
      inlinePolicies: {
        getParameterPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['ssm:GetParameter'],
              resources: ['arn:aws:ssm:*:*:parameter/E2ETest*'],
            }),
          ],
        }),
      },
    });

    const taskDefinition = new TaskDefinition(this, 'TaskDefinition', {
      networkMode: NetworkMode.HOST,
      cpu: '128',
      memoryMiB: '256',
      compatibility: Compatibility.EC2,
      family: props.taskName,
      taskRole: ecsTaskRole,
    });

    taskDefinition.addContainer(`fwe-${props.cpu}`, {
      image: ContainerImage.fromEcrRepository(
        Repository.fromRepositoryArn(this, 'simulation-registry', props.ecrArn),
        props.ecrTag,
      ),
      cpu: 128,
      memoryLimitMiB: 256,
      privileged: true,
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: 'ecs',
      }),
    });
    // Below if statement returns true if props.createS3Bucket is NOT undefined or false
    if (props.createS3Bucket) {
      const s3Bucket = new Bucket(this, 'simulation-bucket', {
        bucketName: PhysicalName.GENERATE_IF_NEEDED,
      });
      // export bucket name
      this.s3BucketName = s3Bucket.bucketName;
    }
  }
}
