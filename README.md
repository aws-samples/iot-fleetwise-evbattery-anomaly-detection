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
cdk deploy -c key_name=myKey IOT305-fleetwise-core-stack IOT305-vehicle-simulator-ecs-cluster-stack IOT305-vehicle-simulator-ecs-task-stack IOT305-twinfleet-stack --require-approval never
```

or

```sh
cdk deploy --all --require-approval never -c key_name=fwdemo1
```

Deploy just the FleetWise core stack. This will setup FleetWise in your AWS Account, with a signal catalog, vehicle model, decoder manifest and a campaign.
```sh
cdk deploy -c key_name=fwdemo1 IOT305-fleetwise-core-stack --require-approval never
```

Where `myKey` is an existing keypair name present in your account to use to SSH into simulation instance.

Once the deployment is finshed, data will start to show up in your Timestream table and you can view the Grafana dashboards.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more 
information.

## License

This code is licensed under the MIT-0 License. See the LICENSE file.
