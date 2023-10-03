# Overview

This project contains the following separate CDK projects, 
- L2 CDK construct to provision AWS IoT Fleetwise for an EV fleet. 
- Vehicle Simulator using ECS to simulate vehicle telemetry into FleetWise
- IoT Twinmaker and Grafana dashbaord for visualization of the telemetry data

The repo produces four stacks: IOT305-fleetwise-core-stack, IOT305-vehicle-simulator-ecs-task-stack, IOT305-vehicle-simulator-ecs-task-stack and IOT305-twinfleet-stack

# Prerequisites

# Install

```sh
git clone https://github.com/aws-samples/iot-fleetwise-evbattery-anomaly-detection.git
cd iot-fleetwise-evbattery-anomaly-detection/
npm install 
```

## Getting started with FleetWise core stack


All four stacks can be deployed using the following command, or we can deploy a single stack at a time

```sh
cdk deploy -c key_name=myKey IOT305-fleetwise-core-stack IOT305-vehicle-simulator-ecs-task-stack IOT305-vehicle-simulator-ecs-task-stack IOT305-twinfleet-stack --require-approval never
```

Deploy just the FleetWise core stack. This will setup FleetWise in your AWS Account, with a signal catalog, vehicle model, decoder manifest and a campaign.
```sh
cdk deploy -c key_name=fwdemo1 IOT305-fleetwise-core-stack --require-approval never
```

Where `myKey` is an existing keypair name present in your account.

The deploy takes about 15 mins mostly due to compilation of the IoT FleetWise agent in the
EC2 instance that simulate the vehicle. Once deploy is finshed, data will start to show up in your Timestream table.

## Getting started with Vehicle Simulator CDK stack
This package contains the Cloud Development Kit (CDK) classes that define all the native AWS resources associated with FleetWise Vehicle Simulator. These classes are written in TypeScript, a statically-bound language based off of JavaScript. The build system is Node, by way of an internal Amazon wrapper called "NpmPrettyMuch".

When this package is built, it produces a set of CloudFormation templates in the ./build/cdk.out directory, one for each of the CloudFormation stacks the package defines in its CDK App. You can deploy these CloudFormation templates to your AWS Account using the CDK Toolkit, which is included in this package, as explained below.

//TODO

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more 
information.

## License

This code is licensed under the MIT-0 License. See the LICENSE file.
