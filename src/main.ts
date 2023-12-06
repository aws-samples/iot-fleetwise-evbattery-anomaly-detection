import * as cdk from 'aws-cdk-lib';
import { FleetWiseStack } from './fleetwisecdk/fleetwise-app';
import { VehicleSimulatorEcsClusterStack } from './simulatorcdk/ecs-cluster';
import { VehicleSimulatorEcsTaskStack } from './simulatorcdk/ecs-task';
import { GrafanaStack } from './twinfleetcdk/lib/grafana-stack';

const app = new cdk.App();
const shortName = '';
const coreStackName = 'fleetwise-core-stack';

const twinFleetShortName = 'twinfleet-stack';
const grafanaShortName = 'grafana-stack';
const databaseName = 'FleetWiseDatabase';
const tableName = 'FleetWiseTable';
const sessionName = 'Detecting EV battery anomalies across a fleet using AWS IoT';
const disambiguator = 'iot'; // replace with username for local testing
const ecsClusterShortName = `${disambiguator}-vehicle-simulator-ecs-cluster-stack`;
const ecsTaskShortName = `${disambiguator}-vehicle-simulator-ecs-task-stack`;
const cpu = 'amd64'; // replace with the actual cpu architecture of Edge application. We currently only support arm64 or amd64
const clusterName = `vehicle-simulator-${cpu}`;
const ecsTaskStackName = `vehicle-simulator-${cpu}-ecs-task-stack`;
const capacityProviderName = `ubuntu-${cpu}-capacity-provider`;
const minimumEc2Instances = 3; // Adjust the minimum number of EC2 instance according to your application
const taskDefinition = `fwe-${cpu}-with-cw`;
const baseImage = 'ubuntu-20-lts';
const ecrTag = 'latest';
const ecrArn = `arn:aws:ecr-public::123456789012:repository/aws-iot-fleetwise-edge`;

new FleetWiseStack(app, coreStackName, {
  scope: app,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  databaseName,
  tableName,
  sessionName,
  shortName,
});

new VehicleSimulatorEcsClusterStack(app, ecsClusterShortName, {
  stackName: ecsClusterShortName,
  ecsClusterName: clusterName,
  ecsCapacityProviderName: capacityProviderName,
  ecsClusterMinimumInstances: minimumEc2Instances,
  enableEc2AutoUpdate: false,
  cpu: cpu,
  baseImage: baseImage,
  createS3Bucket: true
},
);

new VehicleSimulatorEcsTaskStack(app, ecsTaskShortName, {
  cpu: cpu,
  stackName: ecsTaskStackName,
  taskName: taskDefinition,
  ecrArn: ecrArn,
  ecrTag: ecrTag
},
);

new GrafanaStack(app, grafanaShortName,
  {
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
    databaseName: databaseName,
    tableName: tableName,
    twinFleetShortName: twinFleetShortName,
  },
);

app.synth();
