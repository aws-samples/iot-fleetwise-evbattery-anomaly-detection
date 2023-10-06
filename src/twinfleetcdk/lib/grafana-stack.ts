// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 2022
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_s3_assets as Asset } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { Fn } from 'aws-cdk-lib';

export class GrafanaStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        /* select AMI
        const amzn_linux = new ec2.AmazonLinuxImage( {
            generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
            virtualization: ec2.AmazonLinuxVirt.HVM,
            storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
            cpuType: ec2.AmazonLinuxCpuType.X86_64,
        });
        */
        // create VPC
        const smg_vpc = this.create_vpc("GrafanaVPC");

        // create the security group
        let smg_security_group = new ec2.SecurityGroup(this, "GrafanaSecurityGroup", {
            vpc:smg_vpc,
            description: 'Allow http access to ec2 instances for Grafana client',
            allowAllOutbound: true,
            disableInlineRules: false
        });
        
        // add the rule to the security group
        smg_security_group.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allTraffic(), "allow all traffic");
        
        // create instance Role 
        let instance_role = new iam.Role(this, "GrafanaInstanceRole", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com")
        });

        //const instance_role_arn = instance_role.roleArn;

        // create instance policy.  
        // TODO - scope down permissions
        const instance_policy = iam.PolicyStatement.fromJson({
                "Effect": "Allow",
                "Action": "*",
                "Resource": "*"
            })

        // add this as an inline policy
        instance_role.addToPrincipalPolicy(instance_policy);

        // import the bucket arn
        let twinfleet_bucket_arn = Fn.importValue("twinfleet-bucket-arn");

        // create the dashboard role that will be assumed by the grafana instance role
        
        let dashboard_role = new iam.Role(
            this,
            "DashboardRole", {
                assumedBy: new iam.ArnPrincipal(instance_role.roleArn),
                roleName: "evtwin-grafana-dashboard-role",
                inlinePolicies: {
                    "s3_access": new iam.PolicyDocument({
                        statements: [
                            new iam.PolicyStatement({
                                actions: [
                                "s3:ListBucket",
                                "s3:GetBucket*",
                                "s3:GetObject",
                                ],
                                resources: [
                                    twinfleet_bucket_arn,
                                    `${twinfleet_bucket_arn}/*`,
                                ],
                                effect: iam.Effect.ALLOW,
                            }),
                            new iam.PolicyStatement({
                                actions: [
                                    "iottwinmaker:Get*",
                                    "iottwinmaker:List*",
                                ],
                                resources: [
                                    `arn:aws:iottwinmaker:${this.region}:${this.account}:workspace/*`,
                                ],
                                effect: iam.Effect.ALLOW,
                            }),
                            new iam.PolicyStatement({
                                actions: [
                                    "iottwinmaker:ListWorkspaces",
                                ],
                                resources: [
                                    "*"
                                ],
                                effect: iam.Effect.ALLOW,
                            }),
                        ],
                    }),
                },
            }
        );
        // export the role arn for use while setting up the grafana data connector
        new cdk.CfnOutput(this, "grafana-dashboard-role-arn", {
            value: dashboard_role.roleArn,
            exportName: "grafana-dashboard-role-arn"
        });



        // set up ec2 instance for self managed grafana
        let instance = new ec2.Instance(this, "grafanainstance", {
            userData: ec2.UserData.forLinux(),
            vpc: smg_vpc,
            instanceName: "grafanaInstance",
            requireImdsv2: true,
            role: instance_role,
            securityGroup: smg_security_group,
            // not all InstanceClass values are accepted for some reason
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3_AMD, ec2.InstanceSize.MEDIUM),
            machineImage: new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
                cpuType: ec2.AmazonLinuxCpuType.X86_64,
            }),
        });

        // export the public IP
        new cdk.CfnOutput(this, "grafana-instance-public-ip", {
            value: instance.instancePublicIp, 
            exportName: "grafana-instance-public-ip"
        });

        // register the instance setup script in S3 as an Asset
        const resources_dir_name = './src/twinfleetcdk/resources/';
        let asset_path: string = `${resources_dir_name}/setupinstance.sh`;
        let asset = new Asset.Asset(this, "Asset", {
              path: asset_path,
            });
        asset.grantRead(instance.role);

        // specify where to download the user data
        const local_path = instance.userData.addS3DownloadCommand({
            bucket: asset.bucket,
            bucketKey: asset.s3ObjectKey,
            localFile: "/tmp/setupinstance.sh",
        });

        // add execution instructions for script downloaded from S3
        instance.userData.addExecuteFileCommand({
            filePath: local_path,
            arguments: "--quiet",
        });
    } // end constructor
    
    /*
     * create a VPC
     */
    private create_vpc(vpcname: string) {
        const vpc = new ec2.Vpc(this, vpcname, {
            vpcName: vpcname,
            natGateways: 0,
            maxAzs: 1,
            subnetConfiguration: [{
                subnetType: ec2.SubnetType.PUBLIC,
                name: "public",
                cidrMask: 24
            }],
            enableDnsHostnames: false,
        });
        return vpc
    } // end create_vpc

}
