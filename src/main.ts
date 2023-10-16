import * as cdk from 'aws-cdk-lib';
import { GrafanaStack } from './twinfleetcdk/lib/grafana-stack';
import { FleetWiseStack } from './fleetwisecdk/fleetwise-app';
import { VehicleSimulatorEcsClusterStack } from './simulatorcdk/ecs-cluster';
import { VehicleSimulatorEcsTaskStack } from './simulatorcdk/ecs-task';

const app = new cdk.App();
const shortName = 'IOT305'
const coreStackName = 'IOT305-fleetwise-core-stack';

const twinFleetShortName = 'IOT305-twinfleet-stack';
const grafanaShortName = 'IOT305-grafana-stack'
const databaseName = 'FleetWiseDatabase';
const tableName = 'FleetWiseTable';
const sessionName = 'IOT305 - Detecting EV battery anomalies across a fleet using AWS IoT';
const disambiguator = 'IOT305'; // replace with username for local testing
const ecsClusterShortName = `${disambiguator}-vehicle-simulator-ecs-cluster-stack`
const ecsTaskShortName = `${disambiguator}-vehicle-simulator-ecs-task-stack`
const cpu = 'arm64'; // replace with the actual cpu architecture of Edge application. We currently only support arm64 or amd64
const clusterName = `vehicle-simulator-${cpu}`
const ecsTaskStackName = `vehicle-simulator-${cpu}-ecs-task-stack`
const capacityProviderName = `ubuntu-${cpu}-capacity-provider`
const minimumEc2Instances = 2; // Adjust the minimum number of EC2 instance according to your application
const taskDefinition = `fwe-${cpu}-with-cw`
const baseImage = 'ubuntu-20-lts'
const ecrTag = 'launcher.mainline-fwe.d1b3c780'

new FleetWiseStack(app, coreStackName, {
    scope: app,
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
    databaseName,
    tableName,
    sessionName,
    shortName
})

new VehicleSimulatorEcsClusterStack(app, ecsClusterShortName, {
    stackName: ecsClusterShortName,
    ecsClusterName: clusterName,
    ecsCapacityProviderName: capacityProviderName,
    ecsClusterMinimumInstances: minimumEc2Instances,
    enableEc2AutoUpdate: false,
    cpu: cpu,
    baseImage: baseImage
    }
  );

new VehicleSimulatorEcsTaskStack(app, ecsTaskShortName, {
    cpu: cpu,
    stackName: ecsTaskStackName,
    taskName: taskDefinition,
    ecrArn: `arn:aws:ecr:${process.env.CDK_DEFAULT_REGION}:763496144766:repository/vehicle-simulator-${cpu}`,
    ecrTag: ecrTag, // v1.0.7 dirty including changes to slow down catch-up see https://gitlab.aws.dev/aws-iot-automotive/IoTAutobahnVehicleAgent/-/merge_requests/719
    createS3Bucket: true,
    } 
);

// TODO - the Twinfleet stack must be instantiated only after at least 1 set of data values has been populated in
// Timestream.
new GrafanaStack(app, grafanaShortName,
    {
        env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
        databaseName: databaseName,
        tableName: tableName,
        twinFleetShortName: twinFleetShortName
    }
);

app.synth();
