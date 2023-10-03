import * as cdk from 'aws-cdk-lib';
import {
  aws_timestream as ts,
  aws_iam as iam,
  aws_ec2 as ec2
} from 'aws-cdk-lib';
import * as ifw from '.';
import * as fs from 'fs';
import { triggerMode } from './campaign';
import { TimestreamRole } from './tsrrole';
import { VehicleSimulatorEcsClusterStack } from '../simulatorcdk/ecs-cluster';
import { VehicleSimulatorEcsTaskStack } from '../simulatorcdk/ecs-task';

// Replaced the next few items for your testing
//const devAccountId = 'undefined'; // replace with personal account ID for local testing
const devRegion = 'us-east-1'; // replace with the actual region. We currently only support us-west-2, us-east-1 and eu-central-1
const disambiguator = 'IOT305'; // replace with username for local testing
const cpu = 'arm64'; // replace with the actual cpu architecture of Edge application. We currently only support arm64 or amd64
const clusterName = `vehicle-simulator-${cpu}`;
const capacityProviderName = `ubuntu-${cpu}-capacity-provider`;
const minimumEc2Instances = 2; // Adjust the minimum number of EC2 instance according to your application
const taskDefinition = `fwe-${cpu}-with-cw`;


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

const app = new cdk.App();

export class IntegTesting {
  readonly stack: cdk.Stack[];
  constructor() {
    
    const env = {
      region: process.env.CDK_INTEG_REGION || process.env.CDK_DEFAULT_REGION || devRegion,
      account: process.env.CDK_INTEG_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
    };

    const databaseName = 'FleetWiseDatabase';
    const tableName = 'FleetWiseTable';
    const sessionName = 'IOT305 - Detecting EV battery anomalies across a fleet using AWS IoT';
    const shortName = 'IOT305-fleetwise-core-stack';

    const stack = new cdk.Stack(app, shortName, { env });
    const database = new ts.CfnDatabase(stack, 'Database', {
      databaseName,
    });

    const table = new ts.CfnTable(stack, 'Table', {
      databaseName,
      tableName,
    });

    table.node.addDependency(database);

    //get signal catalog to memory from file
    const nodes = fs.readFileSync(__dirname + '/bin/signal-catalog-nodes.json','utf8').replace(/\n|\r/g, "").replace(/\n|\r/g, "").replace(/\s/g, "");
        
    const signalCatalog = new ifw.SignalCatalog(stack, 'SignalCatalog', {
      description: sessionName + ' Signal Catalog',
      name: shortName,
      nodes: [],
      signalCatalogJson: nodes
    });
    
    //put all signals from signal catalog to to the vehicle model
    //read decoder manifest from json file (same as above)
    const decoder_nodes = fs.readFileSync(__dirname + '/bin/decoder-manifest-signals.json','utf8').replace(/\n|\r/g, "").replace(/\n|\r/g, "").replace(/\s/g, "");

    const model_a = new ifw.VehicleModel(stack, 'ModelA', {
      signalCatalog,
      name: 'KII-AWS',
      description: 'KII-AWS vehicle',
      networkInterfaces: [new ifw.CanVehicleInterface('1', 'vcan0')],
      signals: [
        new ifw.CanVehicleSignal('Vehicle', '1',
          401, // messageId
          1.0, // factor
          true, // isBigEndian
          false, // isSigned
          8, // length
          0.0, // offset
          9)
      ],
      signalsb64: decoder_nodes
    });

    const vin100 = new ifw.Vehicle(stack, 'vin100', {
      vehicleName: 'vin100',
      vehicleModel: model_a,
      createIotThing: true,
    });


    const vpc = ec2.Vpc.fromLookup(stack, 'VPC', { isDefault: true });

    const securityGroup = new ec2.SecurityGroup(stack, 'SecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH access');
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allIcmp(), 'ping');

    // EC2 role
    const ec2_role = new iam.Role(stack, 'ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    ec2_role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:List*',
        's3:Get*',
      ],
      resources: ['arn:aws:s3:::*'],
    }));

    // Ubuntu 20.04 for Arm64
    const machineImage = ec2.MachineImage.fromSsmParameter(
      '/aws/service/canonical/ubuntu/server/20.04/stable/current/arm64/hvm/ebs-gp2/ami-id',
      { os: ec2.OperatingSystemType.LINUX },
    );

    // Create the Vehicle simulator
    const keyName = stack.node.tryGetContext('key_name');
    const instance = new ec2.Instance(stack, 'VehicleSim', {
      vpc: vpc,
      instanceType: new ec2.InstanceType('m6g.xlarge'),
      machineImage,
      securityGroup,
      keyName,
      role: ec2_role,
      vpcSubnets: {
        subnetGroupName: 'Public',
      },
      resourceSignalTimeout: cdk.Duration.minutes(30),
    });

    const sourceUrl = 'https://github.com/aws/aws-iot-fleetwise-edge/releases/latest/download/aws-iot-fleetwise-edge-arm64.tar.gz';
    const sourceSIMUrl = 'https://github.com/kkourmousis/RIV23EVEC2TAR/raw/main/aws-iot-fleetwise-evbatterymonitoring.tar.gz';
    const userData = `\
        #!/bin/bash
        set -xeuo pipefail
        exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

        # Wait for any existing package install to finish
        i=0
        while true; do
            if sudo fuser /var/{lib/{dpkg,apt/lists},cache/apt/archives}/lock >/dev/null 2>&1; then
                i=0
            else
                i=\`expr $i + 1\`
                if expr $i \\>= 10 > /dev/null; then
                    break
                fi
            fi
            sleep 1
        done

        # Upgrade system and reboot if required
        apt update && apt upgrade -y
        if [ -f /var/run/reboot-required ]; then
          # Delete the UserData info file so that we run again after reboot
          rm -f /var/lib/cloud/instances/*/sem/config_scripts_user
          reboot
          exit
        fi

        # Install helper scripts:
        apt update && apt install -y python3-setuptools
        mkdir -p /opt/aws/bin
        wget https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz
        python3 -m easy_install --script-dir /opt/aws/bin aws-cfn-bootstrap-py3-latest.tar.gz
        rm aws-cfn-bootstrap-py3-latest.tar.gz

        # On error, signal back to cfn:
        error_handler() {
          /opt/aws/bin/cfn-signal --stack ${stack.stackName} --resource ${instance.instance.logicalId} --region ${stack.region};
        }
        trap error_handler ERR

        # Increase pid_max:
        echo 1048576 > /proc/sys/kernel/pid_max
        # Disable syslog:
        systemctl stop syslog.socket rsyslog.service
        # Remove journald rate limiting and set max size:
        printf "RateLimitBurst=0\nSystemMaxUse=1G\n" >> /etc/systemd/journald.conf

        # Install packages
        apt update && apt install -y wget ec2-instance-connect htop jq unzip

        # Install AWS CLI:
        curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"
        unzip -q awscliv2.zip
        ./aws/install
        rm awscliv2.zip

        # Install packages for Battery Monitoring sample
        sudo apt install python3-pip -y
        sudo python3 -m pip install --upgrade pip
        sudo apt install  python3-numpy python3-pandas  -y        
        sudo -u ubuntu python3 -m pip install cython 
        sudo -u ubuntu python3 -m pip install wrapt==1.11 
        sudo -u ubuntu python3 -m pip install cantools can-isotp
        sudo apt install -y git ec2-instance-connect htop jq unzip
        sudo pip3 install --upgrade pandas numpy
        sudo apt-get install can-utils -y
        sudo apt-get install linux-modules-extra-$(uname -r) -y
        sudo modprobe can
        sudo modprobe can_raw
        sudo modprobe vcan
        sudo ip link add dev vcan0 type vcan
        sudo ip link set up vcan0
        
        # Download source
        cd /home/ubuntu
  
        sudo -u ubuntu wget ${sourceUrl} -O aws-iot-fleetwise-edge.tar.gz
        sudo -u ubuntu mkdir dist && cd dist
        sudo -u ubuntu tar -zxf ../aws-iot-fleetwise-edge.tar.gz
        sudo -u ubuntu mkdir -p build/src/executionmanagement
        sudo -u ubuntu mv aws-iot-fleetwise-edge build/src/executionmanagement
        
        # Install SocketCAN modules:
        sudo ./tools/install-socketcan.sh --bus-count 1
        
        # Install CAN Simulator
        sudo ./tools/install-cansim.sh --bus-count 1
        
        # Install FWE credentials and config file
        sudo mkdir /etc/aws-iot-fleetwise
        sudo mkdir /var/aws-iot-fleetwise

        sudo echo -n "${vin100.certificatePem}" > /etc/aws-iot-fleetwise/certificate.pem
        sudo echo -n "${vin100.privateKey}" > /etc/aws-iot-fleetwise/private-key.key
        sudo ./tools/configure-fwe.sh \
          --input-config-file "configuration/static-config.json" \
          --output-config-file "/etc/aws-iot-fleetwise/config-0.json" \
          --vehicle-name vin100 \
          --endpoint-url "${vin100.endpointAddress}" \
          --topic-prefix '$aws/iotfleetwise/' \
          --can-bus0 "vcan0"

        # Install FWE
        sudo ./tools/install-fwe.sh
        
        # Signal init complete:
        /opt/aws/bin/cfn-signal --stack ${stack.stackName} --resource ${instance.instance.logicalId} --region ${stack.region}
        
        #Fetching vehicle data and scripts
        cd /home/ubuntu
        sudo -u ubuntu wget ${sourceSIMUrl} -O /home/ubuntu/aws-iot-fleetwise-evbatterymonitoring.tar.gz
        sudo -u ubuntu tar -zxf /home/ubuntu/aws-iot-fleetwise-evbatterymonitoring.tar.gz 2>/dev/null
        ROOTDIR=/home/ubuntu/aws-iot-fleetwise-evbatterymonitoring/simulatedvehicle/canreplay
        
        #Since we don't have decoded signal data, we are going to replay the log of the captured data, with the exact data captured
        sudo cp -f $ROOTDIR/service/simulationreplay.vin100.service /etc/systemd/system/simulationreplay.vin100.service
        #sudo -u ubuntu rm /home/ubuntu/aws-iot-fleetwise-evbatterymonitoring.tar.gz
        #sudo -u ubuntu $ROOTDIR/service/start_replay_simulation.sh
        sudo systemctl daemon-reload
        sudo systemctl enable simulationreplay.vin100.service
        sudo systemctl start simulationreplay.vin100.service
        
        #The following section will replace the above, once we have proper signal data as source
        #sudo cp -f $ROOTDIR/service/evcansimulation.vin100.service /etc/systemd/system/evcansimulation.service
        #sudo systemctl enable evcansimulation.service
        #sudo systemctl start evcansimulation.service
        #sudo $ROOTDIR/service/start_simulation.sh vin100
        #sudo systemctl daemon-reload
        #sudo systemctl enable evcansimulation.service
        #sudo systemctl start evcansimulation.service
        `;

    instance.addUserData(userData);

    new cdk.CfnOutput(stack, 'Vehicle Sim ssh command', { value: `ssh -i ${keyName}.pem ubuntu@${instance.instancePublicIp}` });
    
new ifw.Campaign(stack, 'Campaign', {
  name: "cesDemo-ProdUnhealthyVehicleDetectorCampaign",
  description: "An event-based campaign that collects data when an unhealthy vehicle is detected from production fleet",
  //targetArn: "arn:aws:iotfleetwise:eu-central-1:755536927200:fleet/cesDemoProductionFleet",
  compression: "SNAPPY",
  diagnosticsMode: "SEND_ACTIVE_DTCS",
  spoolingMode: "TO_DISK",
  target: vin100,
  collectionScheme: new ifw.ConditionBasedCollectionScheme(
    //"$variable.`Vehicle.Powertrain.Battery.hasActiveDTC` == true || $variable.`Vehicle.Powertrain.Battery.StateOfHealth` < 75",
    "$variable.`Vehicle.Powertrain.Battery.hasActiveDTC` == true || $variable.`Vehicle.Powertrain.Battery.StateOfHealth` > 0", //so that we get all data for tests
    1,
    10000,
    triggerMode.ALWAYS
  ),
  signals: [
    new ifw.CampaignSignal('Vehicle.Powertrain.Battery.hasActiveDTC'),
    new ifw.CampaignSignal('Vehicle.Powertrain.Battery.StateOfHealth'),
    new ifw.CampaignSignal('Vehicle.Powertrain.Battery.Module.MaxTemperature'),
    new ifw.CampaignSignal('Vehicle.Powertrain.Battery.Module.MinTemperature'),
    new ifw.CampaignSignal('Vehicle.Powertrain.Battery.Module.MaxCellVoltage'),
    new ifw.CampaignSignal('Vehicle.Powertrain.Battery.Module.MinCellVoltage')
  ],
  dataDestinationConfigs: [ new ifw.TimeStreamDestinationConfig(
    TimestreamRole.getOrCreate(stack).role.roleArn,
    table.attrArn
  )],
  autoApprove: true,
});

new ifw.Fleet(stack, 'Fleet', {
  fleetId: 'fleet',
  signalCatalog,
  vehicles: [vin100],
});

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

this.stack = [stack];
}
}

new IntegTesting();


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


