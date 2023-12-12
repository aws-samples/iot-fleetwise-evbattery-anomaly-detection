# Overview

As vehicle fleets electrify, the ability to detect electric vehicle (EV) battery anomalies early becomes critical. This project provides a foundation for building a connected vehicle platform on AWS using AWS IoT FleetWise and AWS IoT Twinmaker. The project creates (through CDK) a full end-to-end FleetWise application with virtual devices (a single device, or a virtual Fleet on ECS) and has dashboards to visualize the data from your fleeet.

This repository has a [corresponding workshop](https://catalog.us-east-1.prod.workshops.aws/workshops/79296185-6a04-4e79-a77c-f15afd51e877) available that will allow you to walk through finding EV batter faults in your fleet. In this workshop, we provide a high-level overview of AWS IoT Fleetwise, you will get hands-on experience using AWS IoT Core to manage the provisioning certification for a fleet of vehicles. You’ll work through vehicle modeling, campaign creation, and data ingestion using AWS IoT FleetWise, then set up a dashboard to view metrics. This repo can be used as a standalone project to begin building, or you can use AWS 

Note: This project goes over higher level concepts building fleet data analytics pipeline using AWS services like AWS IoT Twinmaker, AWS IoT Fleetwise and Grafana. If you want a 200 level workshop that runs through creating AWS IoT FleetWise constructs, we would recommend staring with the [AWS Connected Vehicle workshop](https://catalog.workshops.aws/awsiotforautomotive/), and using the [FleetWise module](https://catalog.workshops.aws/awsiotforautomotive/en-US/4-fleetwise)

This project contains the following separate CDK projects, and are not required independently, but the vehicle models that are created in the FleetWise core stack are used in the Grafana and Twinmaker stack.
- L2 CDK construct to provision AWS IoT Fleetwise for an EV fleet. 
- Vehicle Simulator using ECS to simulate vehicle telemetry into FleetWise
- IoT Twinmaker and Grafana dashbaord for visualization of the telemetry data

The repo using a ```deploy --all``` command will create five stacks: fleetwise-core-stack, vehicle-simulator-ecs-task-stack, vehicle-simulator-ecs-task-stack twinfleet-stack

# FleetWise Core Stack

The FleetWise core stack provides a simple demo to visualize and import EV data that's built using AWS IoT FleetWise. All vehicle data is sent to Amazon Timestream from a single EC2 instance using synthetic data posted to a virtual CAN interface. This stack sets up everything needed to visualize vehicle data using FleetWise; a Signal Catalog, a Vehicle Model, a Decoder Manifest and a default campaign.

# Vehicle Simulator Stack

The vehicle simulator stack, in conjunction with the [vehicle simulator repository](hhttps://github.com/aws-samples/iot-fleetwise-vehicle-simulator) will build an ECS cluster, an ECS task, which will pull from the publically available [FleetWise Docker image](https://gallery.ecr.aws/aws-iot-fleetwise-edge/aws-iot-fleetwise-edge) and use synthetic data to build a small fleet in Sunnyvale, CA.

# TwinFleet + Grafana Stack

The AWS IoT digital twin service, AWS IoT Twinmaker, provides the capbilities to create digital twins of real-world systems and apply them to monitor and optimize industrial operations. For automotive, we provide a digital twin of the vehicle to identify potential areas of fault. In this stack, we create a digital twin of the vehicle and its corresponding fleet and show those digital twins in Grafana dashboards. These stacks are dependant on each other and can be combined with just the FleetWise Core stack to visualize the outputs of a single vehicle.

# Dashboards

Within this repository are two dashboards we built with Grafana, using AWS IoT Twinmaker and Amazon Timestream as our datasources

## Fleet Operator

![operator](https://static.us-east-1.prod.workshops.aws/public/0416cc90-480f-4d4d-ada2-78b82eaaad37/static/images/2-grafana-map.png)

## InspectionView

![inspection](https://static.us-east-1.prod.workshops.aws/public/0416cc90-480f-4d4d-ada2-78b82eaaad37/static/images/2-grafana-dashboard.png)

# Architecture

Below architecture diagram shows the high-level architecture that is built when running through this this project. 

![assets](/assets/archdiagram.png)

# Setup

```sh
git clone https://github.com/aws-samples/iot-fleetwise-evbattery-anomaly-detection.git
cd iot-fleetwise-evbattery-anomaly-detection/
npm install 
```

## Getting started with FleetWise core stack

All five stacks can be deployed using the following command, or we can deploy a single stack at a time

```sh
cdk deploy -c key_name={MY KEY} fleetwise-core-stack iot-vehicle-simulator-ecs-cluster-stack iot-vehicle-simulator-ecs-task-stack twinfleet-stack grafana-stack/twinfleet-stack --require-approval never
```

or

```sh
cdk deploy --all --require-approval never -c key_name={MY KEY}
```

Replace {MY KEY} with a KeyPair that is already created in your AWS account that you can use to SSH to the simulation instance.

OR deploy just the FleetWise core stack. This will setup FleetWise in your AWS Account, with a signal catalog, vehicle model, decoder manifest and a campaign.

```sh
cdk deploy -c key_name={MY KEY} fleetwise-core-stack --require-approval never
```

Where `{MY KEY}` is an existing keypair present in your account to use to SSH into simulation instance.

Once the deployment is finshed, data will start to show up in your Timestream table and you can view the Grafana dashboards.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more 
information.

## License

This code is licensed under the MIT-0 License. See the LICENSE file.
