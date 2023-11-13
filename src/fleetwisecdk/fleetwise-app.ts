import * as fs from 'fs';
import * as cdk from 'aws-cdk-lib';
import {
  aws_timestream as ts,
  aws_iam as iam,
  aws_ec2 as ec2,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ifw from '.';
import { triggerMode } from './campaign';
import { TimestreamRole } from './tsrrole';

export interface FleetWiseStackProps {
  scope: cdk.App;
  env: cdk.Environment;
  databaseName: string;
  tableName: string;
  sessionName: string;
  shortName: string;
}
//
export class FleetWiseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FleetWiseStackProps) {
    super(scope, id, props);

    const database = new ts.CfnDatabase(this, 'Database', {
      databaseName: props.databaseName,
    });

    const table = new ts.CfnTable(this, 'Table', {
      databaseName: props.databaseName,
      tableName: props.tableName,
    });

    table.node.addDependency(database);

    //get signal catalog to memory from file
    const nodes = fs.readFileSync(__dirname + '/bin/signal-catalog-nodes.json', 'utf8').replace(/\n|\r/g, '').replace(/\n|\r/g, '').replace(/\s/g, '');

    const signalCatalog = new ifw.SignalCatalog(this, 'SignalCatalog', {
      description: props.shortName + ' Signal Catalog',
      name: props.shortName,
      nodes: [],
      signalCatalogJson: nodes,
    });

    //put all signals from signal catalog to to the vehicle model
    //read decoder manifest from json file (same as above)
    const decoder_nodes = fs.readFileSync(__dirname + '/bin/decoder-manifest-signals.json', 'utf8').replace(/\n|\r/g, '').replace(/\n|\r/g, '').replace(/\s/g, '');

    const model_a = new ifw.VehicleModel(this, 'ModelA', {
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
          9),
      ],
      signalsb64: decoder_nodes,
    });

    const KNADE163966083100 = new ifw.Vehicle(this, 'KNADE163966083100', {
      vehicleName: 'KNADE163966083100',
      vehicleModel: model_a,
      createIotThing: true,
    });


    const vpc = ec2.Vpc.fromLookup(this, 'VPC', { isDefault: true });

    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH access');
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allIcmp(), 'ping');

    // EC2 role
    const ec2_role = new iam.Role(this, 'ec2Role', {
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

    // Ubuntu 20.04 for amd64
    const machineImage = ec2.MachineImage.fromSsmParameter(
      '/aws/service/canonical/ubuntu/server/20.04/stable/current/amd64/hvm/ebs-gp2/ami-id',
      { os: ec2.OperatingSystemType.LINUX },
    );

    // Create the Vehicle simulator
    const keyName = this.node.tryGetContext('key_name');
    const instance = new ec2.Instance(this, 'VehicleSim', {
      vpc: vpc,
      instanceType: new ec2.InstanceType('m5a.xlarge'),
      machineImage,
      securityGroup,
      keyName,
      role: ec2_role,
      vpcSubnets: {
        subnetGroupName: 'Public',
      },
      resourceSignalTimeout: cdk.Duration.minutes(30),
    });

    const sourceUrl = 'https://github.com/aws/aws-iot-fleetwise-edge/releases/download/v1.0.7/aws-iot-fleetwise-edge-amd64.tar.gz';
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
          /opt/aws/bin/cfn-signal --stack ${this.stackName} --resource ${instance.instance.logicalId} --region ${this.region};
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

        sudo echo -n "${KNADE163966083100.certificatePem}" > /etc/aws-iot-fleetwise/certificate.pem
        sudo echo -n "${KNADE163966083100.privateKey}" > /etc/aws-iot-fleetwise/private-key.key
        sudo ./tools/configure-fwe.sh \
          --input-config-file "configuration/static-config.json" \
          --output-config-file "/etc/aws-iot-fleetwise/config-0.json" \
          --vehicle-name KNADE163966083100 \
          --endpoint-url "${KNADE163966083100.endpointAddress}" \
          --topic-prefix '$aws/iotfleetwise/' \
          --can-bus0 "vcan0"

        # Install FWE
        sudo ./tools/install-fwe.sh
        
        # Signal init complete:
        /opt/aws/bin/cfn-signal --stack ${this.stackName} --resource ${instance.instance.logicalId} --region ${this.region}
        
        #Fetching vehicle data and scripts
        cd /home/ubuntu
        sudo -u ubuntu wget ${sourceSIMUrl} -O /home/ubuntu/aws-iot-fleetwise-evbatterymonitoring.tar.gz
        sudo -u ubuntu tar -zxf /home/ubuntu/aws-iot-fleetwise-evbatterymonitoring.tar.gz 2>/dev/null
        ROOTDIR=/home/ubuntu/aws-iot-fleetwise-evbatterymonitoring/simulatedvehicle/canreplay
        
        #Since we don't have decoded signal data, we are going to replay the log of the captured data, with the exact data captured
        sudo cp -f $ROOTDIR/service/simulationreplay.KNADE163966083100.service /etc/systemd/system/simulationreplay.KNADE163966083100.service
        sudo systemctl daemon-reload
        sudo systemctl enable simulationreplay.KNADE163966083100.service
        sudo systemctl start simulationreplay.KNADE163966083100.service
        
        #The following section will replace the above, once we have proper signal data as source
        #sudo cp -f $ROOTDIR/service/evcansimulation.KNADE163966083100.service /etc/systemd/system/evcansimulation.service
        #sudo systemctl enable evcansimulation.service
        #sudo systemctl start evcansimulation.service
        #sudo $ROOTDIR/service/start_simulation.sh KNADE163966083100
        #sudo systemctl daemon-reload
        #sudo systemctl enable evcansimulation.service
        #sudo systemctl start evcansimulation.service
        `;

    instance.addUserData(userData);

    new cdk.CfnOutput(this, 'Vehicle Sim ssh command', { value: `ssh -i ${keyName}.pem ubuntu@${instance.instancePublicIp}` });

    new ifw.Campaign(this, 'Campaign', {
      name: 'iot305-ProdUnhealthyVehicleDetectorCampaign',
      description: 'An event-based campaign that collects data when an unhealthy vehicle is detected from production fleet',
      //targetArn: "arn:aws:iotfleetwise:eu-central-1:755536927200:fleet/cesDemoProductionFleet",
      compression: 'SNAPPY',
      diagnosticsMode: 'SEND_ACTIVE_DTCS',
      spoolingMode: 'TO_DISK',
      target: KNADE163966083100,
      collectionScheme: new ifw.ConditionBasedCollectionScheme(
      //"$variable.`Vehicle.Powertrain.Battery.hasActiveDTC` == true || $variable.`Vehicle.Powertrain.Battery.StateOfHealth` < 75",
        '$variable.`Vehicle.Powertrain.Battery.hasActiveDTC` == true || $variable.`Vehicle.Powertrain.Battery.StateOfHealth` >= 0', //so that we get all data for tests
        1,
        10000,
        triggerMode.ALWAYS,
      ),
      signals: [
        new ifw.CampaignSignal('Vehicle.Chassis.Axle.LeftFrontTirePressure'),
        new ifw.CampaignSignal('Vehicle.Chassis.Axle.LeftFrontTireTemperature'),
        new ifw.CampaignSignal('Vehicle.Chassis.Axle.LeftRearTirePressure'),
        new ifw.CampaignSignal('Vehicle.Chassis.Axle.LeftRearTireTemperature'),
        new ifw.CampaignSignal('Vehicle.Chassis.Axle.RightFrontTirePressure'),
        new ifw.CampaignSignal('Vehicle.Chassis.Axle.RightFrontTireTemperature'),
        new ifw.CampaignSignal('Vehicle.Chassis.Axle.RightRearTirePressure'),
        new ifw.CampaignSignal('Vehicle.Chassis.Axle.RightRearTireTemperature'),
        new ifw.CampaignSignal('Vehicle.CurrentLocation.Latitude'),
        new ifw.CampaignSignal('Vehicle.CurrentLocation.Longitude'),
        new ifw.CampaignSignal('Vehicle.InCabinTemperature'),
        new ifw.CampaignSignal('Vehicle.OutsideAirTemperature'),
        new ifw.CampaignSignal('Vehicle.Speed'),
        new ifw.CampaignSignal('Vehicle.TotalOperatingTime'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.hasActiveDTC'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.FanRunning'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.BatteryAvailableChargePower'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.BatteryAvailableDischargePower'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.BatteryCurrent'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.BatteryDCVoltage'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.Charging.IsCharging'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.StateOfCharge.Current'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.StateOfCharge.Displayed'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.StateOfHealth'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.Module.MaxTemperature'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.Module.MinTemperature'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.Module.MaxCellVoltage'),
        new ifw.CampaignSignal('Vehicle.Powertrain.Battery.Module.MinCellVoltage'),
      ],
      dataDestinationConfigs: [new ifw.TimeStreamDestinationConfig(
        TimestreamRole.getOrCreate(this).role.roleArn,
        table.attrArn,
      )],
      autoApprove: true,
    });

    new ifw.Fleet(this, 'Fleet', {
      fleetId: 'fleet',
      signalCatalog,
      vehicles: [KNADE163966083100],
    });

  }

}