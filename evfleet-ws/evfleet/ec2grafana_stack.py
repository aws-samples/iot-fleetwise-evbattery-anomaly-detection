# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 2022
# SPDX-License-Identifier: Apache-2.0

from aws_cdk import (
    # Duration,
    Stack,
    aws_ec2 as ec2,
    aws_iam as iam,
    RemovalPolicy,
    CfnOutput,
    Fn
)

from constructs import Construct
import os

from aws_cdk.aws_s3_assets import Asset
from evfleet.evfleet_stack import EVFleetStack

dirname = os.path.dirname(__file__)

class EC2GrafanaStack(Stack):

    def create_vpc(self, vpcname):
        vpc = ec2.Vpc(self, vpcname,
            vpc_name = vpcname,
            nat_gateways=0,
            max_azs = 1,
            subnet_configuration=[ec2.SubnetConfiguration(name="public",subnet_type=ec2.SubnetType.PUBLIC)]
        )
        return vpc


    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Save account and region for later use
        account = Stack.of(self).account
        region = Stack.of(self).region


        # select AMI
        amzn_linux = ec2.MachineImage.latest_amazon_linux(
            generation= ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
            edition= ec2.AmazonLinuxEdition.STANDARD,
            virtualization= ec2.AmazonLinuxVirt.HVM,
            storage= ec2.AmazonLinuxStorage.GENERAL_PURPOSE
            )

        # create instance Role 
        instance_role = iam.Role(self, "GrafanaInstanceRole", assumed_by=iam.ServicePrincipal("ec2.amazonaws.com"))
        instance_role_arn = instance_role.role_arn

        # create instance policy.  
        # TODO - scope down permissions
        instance_policy = iam.PolicyStatement.from_json({
                "Effect": "Allow",
                "Action": "*",
                "Resource": "*"
            })

        # add this as an inline policy
        instance_role.add_to_principal_policy(instance_policy)

        # import the twinmaker_bucket arn
        twinmaker_bucket_arn = Fn.import_value("twinmaker-bucket-arn")

        # create the dashboard role that will be assumed by the grafana instance role
        dashboard_role = iam.Role(
            self,
            "DashboardRole",
            role_name="evtwin-grafana-dashboard-role",
            assumed_by= iam.ArnPrincipal(instance_role_arn),
            inline_policies={
                "s3_access": iam.PolicyDocument(
                    statements=[
                        iam.PolicyStatement(
                            actions=[
                                "s3:ListBucket",
                                "s3:GetBucket*",
                                "s3:GetObject",
                            ],
                            resources=[
                                twinmaker_bucket_arn,
                                f"{twinmaker_bucket_arn}/*",
                            ],
                            effect=iam.Effect.ALLOW,
                        ),
                        iam.PolicyStatement(
                            actions=[
                                "iottwinmaker:Get*",
                                "iottwinmaker:List*"
                            ],
                            resources=[
                                f"arn:aws:iottwinmaker:{region}:{account}:workspace/*"
                            ],
                            effect=iam.Effect.ALLOW,
                        ),
                        iam.PolicyStatement(
                            actions=[
                                "iottwinmaker:ListWorkspaces"
                            ],
                            resources=[
                                "*"
                            ],
                            effect=iam.Effect.ALLOW,
                        ),
                    ]
                )
            },
        )

        # create the VPC
        smg_vpc = self.create_vpc("grafanaVPC")

        # create a security group
        smg_security_group = ec2.SecurityGroup(self, "GrafanaSecurityGroup",
            vpc = smg_vpc,
            description="Allow http access to ec2 instances for Grafana client",
            allow_all_outbound=True,
            disable_inline_rules = False
            )

        # add the rule to the security group
        smg_security_group.add_ingress_rule(ec2.Peer.any_ipv4(), ec2.Port.all_traffic(), "allow all traffic")

        # set up ec2 instance for self managed grafana
        instance = ec2.Instance(self, "grafanainstance",
            vpc = smg_vpc,
            instance_name = "grafanaInstance",
            require_imdsv2 = True,
            role = instance_role,
            security_group = smg_security_group,

            # not all InstanceClass values are accepted for some reason
            instance_type= ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3_AMD, ec2.InstanceSize.MEDIUM),

            machine_image= ec2.AmazonLinuxImage(generation=ec2.AmazonLinuxGeneration.AMAZON_LINUX_2)
        )

        # export the public IP
        CfnOutput(self, "grafana-instance-public-ip", value = instance.instance_public_ip, 
                  export_name = "instance-public-ip")

        # register the instance setup script in S3 as an Asset
        asset = Asset(self, "Asset", path=os.path.join(dirname, "setupinstance.sh"))
        asset.grant_read(instance.role)

        # specify where to download the user data
        local_path = instance.user_data.add_s3_download_command(
            bucket= asset.bucket,
            bucket_key= asset.s3_object_key,
            local_file = "/tmp/setupinstance.sh"
        )

        # add execution instructions for script downloaded from S3
        instance.user_data.add_execute_file_command(file_path = local_path)

