/*
import * as cdk from 'aws-cdk-lib';
import { VehicleSimulatorEcsClusterStack } from '../simulatorcdk/ecs-cluster';
import { VehicleSimulatorEcsTaskStack } from '../simulatorcdk/ecs-task';

//const devAccountId = 'undefined'; // replace with personal account ID for local testing
//const devRegion = 'us-east-1'; // replace with the actual region. We currently only support us-west-2, us-east-1 and eu-central-1
const disambiguator = 'IOT305'; // replace with username for local testing
const cpu = 'arm64'; // replace with the actual cpu architecture of Edge application. We currently only support arm64 or amd64
const clusterName = `vehicle-simulator-${cpu}`;
const capacityProviderName = `ubuntu-${cpu}-capacity-provider`;
const minimumEc2Instances = 2; // Adjust the minimum number of EC2 instance according to your application
const taskDefinition = `fwe-${cpu}-with-cw`;
const env = {
    region: process.env.CDK_INTEG_REGION || process.env.CDK_DEFAULT_REGION || process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_INTEG_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
  };

export interface VehicleSimulatorStackProps {
    scope: cdk.App;
    env: cdk.Environment;
    ecsClusterStackId: string;
    ecsClusterStackName: string;
    ecsTaskStackId: string;
    ecsTaskStackName: string;
    ec2Cpu: string;
    ec2BaseImage: string;
    ecsClusterName: string;
    ecsCapacityProviderName: string;
    ecsClusterMinimumInstances: number;
    enableEc2AutoUpdate: boolean;
    ecsTaskDefinition: string;
    createS3Bucket: boolean;
  }

  // This function will create ECS Cluster Stack and ECS Task Stack for Vehicle Simulator.
export function createVehicleSimulatorStacks({
    env,
    ecsClusterStackId,
    ecsClusterStackName,
    ecsTaskStackId,
    ecsTaskStackName,
    ec2Cpu,
    ec2BaseImage,
    ecsClusterName,
    ecsCapacityProviderName,
    ecsClusterMinimumInstances,
    enableEc2AutoUpdate,
    ecsTaskDefinition,
    createS3Bucket,
  }: VehicleSimulatorStackProps): [
    VehicleSimulatorEcsClusterStack,
    VehicleSimulatorEcsTaskStack
  ] {
    const ecsClusterStack = new VehicleSimulatorEcsClusterStack(
      app,
      ecsClusterStackId,
      {
        cpu: ec2Cpu,
        stackName: ecsClusterStackName,
        //  If you want to use SSH Key for debugging EC2. Add a new entry: ec2Key: 'your-key',
        //  note the key needs to be created ahead of time.
        ecsClusterName: ecsClusterName,
        ecsCapacityProviderName: ecsCapacityProviderName,
        ecsClusterMinimumInstances: ecsClusterMinimumInstances,
        enableEc2AutoUpdate: enableEc2AutoUpdate,
        baseImage: ec2BaseImage,
      }
    );
    const ecsTaskStack = new VehicleSimulatorEcsTaskStack(app, ecsTaskStackId, {
      cpu: ec2Cpu,
      stackName: ecsTaskStackName,
      taskName: ecsTaskDefinition,
      ecrArn: `arn:aws:ecr:${env.region}:763496144766:repository/vehicle-simulator-${ec2Cpu}`,
      ecrTag: 'launcher.mainline-fwe.d1b3c780', // v1.0.7 dirty including changes to slow down catch-up see https://gitlab.aws.dev/aws-iot-automotive/IoTAutobahnVehicleAgent/-/merge_requests/719
      createS3Bucket: createS3Bucket,
    });
    return [ecsClusterStack, ecsTaskStack];
  }


  // Below will create a stand-alone Vehicle Simulator with EC2 OS auto update disabled and S3 bucket creation enabled.
  createVehicleSimulatorStacks({
    scope: app,
    env: env,
    ecsClusterStackId: `${disambiguator}-vehicle-simulator-ecs-cluster-stack`,
    ecsClusterStackName: `vehicle-simulator-${cpu}-ecs-cluster-stack`,
    ecsTaskStackId: `${disambiguator}-vehicle-simulator-ecs-task-stack`,
    ecsTaskStackName: `vehicle-simulator-${cpu}-ecs-task-stack`,
    ec2Cpu: cpu,
    ec2BaseImage: 'ubuntu-20-lts', // by default, we will be using Amazon Linux 2 with Kernel 5.10
    ecsClusterName: clusterName,
    ecsCapacityProviderName: capacityProviderName,
    ecsClusterMinimumInstances: minimumEc2Instances,
    enableEc2AutoUpdate: false,
    ecsTaskDefinition: taskDefinition,
    createS3Bucket: true,
  });

  */