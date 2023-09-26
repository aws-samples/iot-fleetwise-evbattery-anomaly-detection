# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 2022
# SPDX-License-Identifier: Apache-2.0

import json
from aws_cdk import (
    # Duration,
    Stack,
    aws_s3 as s3,
    aws_s3_deployment as s3deploy,
    aws_iottwinmaker as twinmaker,
    aws_iam as iam,
    RemovalPolicy,
    CfnOutput
)

from constructs import Construct
from os import path, makedirs


from .component import EVDataComponent
from evfleet.scene import Scene


class EVFleetStack(Stack):

    #
    #
    #
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Save account and region for later use
        account = Stack.of(self).account
        region = Stack.of(self).region

        WS_ID = "evtwin2"
        SCENE_ID = "evfleet"
        workspace_id = WS_ID

        # Create an S3 bucket for the TwinMaker Workspace
        S3_BUCKET_NAME = f"evtwin2-evfleet-{account}-{region}"

        cors_rule = s3.CorsRule(
            allowed_methods=[s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT, s3.HttpMethods.DELETE, 
                s3.HttpMethods.HEAD],
            allowed_origins=["*"],

            # the properties below are optional
            allowed_headers=["*"],
        )

        twinmaker_bucket = s3.Bucket(
            self,
            "TwinMakerResources",
            bucket_name= S3_BUCKET_NAME,

            # Block every public access
            access_control=s3.BucketAccessControl.PRIVATE,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            public_read_access=False,

            cors = [cors_rule],

            # Encrypt Data at rest
            encryption=s3.BucketEncryption.S3_MANAGED,

            # Encrypt Data in transit
            enforce_ssl=True,

            # Enable versioning
            versioned=True,

            ## Retain S3 bucket
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,

            # https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html
            object_ownership=s3.ObjectOwnership.OBJECT_WRITER,
        )
        # export the bucket as an output of the stack
        CfnOutput(self, "twinmaker-bucket-arn", value = twinmaker_bucket.bucket_arn, export_name = "twinmaker-bucket-arn")

        # Create a role to be used by the TwinMaker Workspace
        twinmaker_role = iam.Role(
            self,
            "TwinMakerRole",
            role_name="evtwin2-twinmaker-role",
            assumed_by=iam.ServicePrincipal("iottwinmaker.amazonaws.com"),
            inline_policies={
                "evtwin2-inline-policy": iam.PolicyDocument(
                    statements=[
                        iam.PolicyStatement(
                            actions=[
                                "s3:ListBucket",
                                "s3:GetBucket*",
                                "s3:GetObject",
                                "s3:PutObject",
                            ],
                            resources=[
                                twinmaker_bucket.bucket_arn,
                                f"{twinmaker_bucket.bucket_arn}/*",
                            ],
                            effect=iam.Effect.ALLOW,
                        ),
                        iam.PolicyStatement(
                            actions=["s3:DeleteObject"],
                            resources=[
                                f"{twinmaker_bucket.bucket_arn}/DO_NOT_DELETE_WORKSPACE_{workspace_id}"
                            ],
                            effect=iam.Effect.ALLOW,
                        ),
                        iam.PolicyStatement(
                            actions=["lambda:invokeFunction"],
                            resources=[
                                f"arn:aws:lambda:{region}:{account}:function:*"
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
                            resources=[ "*" ],
                            effect=iam.Effect.ALLOW,
                        ),
                    ]
                )
            },
        )

        # Create the Workspace
        workspace = twinmaker.CfnWorkspace(
            self,
            "TwinMakerWorkspace",
            workspace_id= WS_ID,
            role=twinmaker_role.role_arn,
            s3_location=twinmaker_bucket.bucket_arn,
        )
        workspace.node.add_dependency(twinmaker_role)
        workspace.node.add_dependency(twinmaker_bucket)

        # Create the com.user.evtwindata component
        evdatacomponent = EVDataComponent(self, "EVDataComponent", workspace.workspace_id)
        evdatacomponent.node.add_dependency(workspace)

        # create the scene json
        VEHICLES_IN_FLEET = 100 
        scene = Scene(VEHICLES_IN_FLEET)
        scene_json = json.dumps(scene.scene_base)

        # upload the scene json to the S3 Bucket
        deploy = s3deploy.BucketDeployment(
            self,
            "DeployTwinMakerModels",
            sources=[
                s3deploy.Source.asset("twinmaker_resources"),
                s3deploy.Source.data("scene/evfleet.json", scene_json),
            ],
            destination_bucket=twinmaker_bucket,
            prune=False,
        )

        # create the scene in the TwinMaker Workspace
        scene = twinmaker.CfnScene(
            self,
            "FleetView",
            scene_id= SCENE_ID,
            workspace_id= WS_ID,
            content_location=twinmaker_bucket.s3_url_for_object("scene/evfleet.json"),
        )   
        scene.node.add_dependency(deploy)

        # create fleet (parent) entity
        fleet_name = "fleetEV"
        fleet_entity = self.create_entity(fleet_name, "FLEET", workspace)

        # create entities for the vehicles
        for i in range(1, VEHICLES_IN_FLEET + 1):
            vehicle_name = f"Vehicle{i}"
            car_entity = self.create_entity(vehicle_name, "CAR", workspace)
            car_entity.node.add_dependency(fleet_entity)
            car_entity.node.add_dependency(evdatacomponent)
            car_entity.node.add_dependency(workspace)

    #
    # create_entity 
    #   entityName = name of the entity
    #   entityType = a string holding the entity type.  Must be "CAR" or "FLEET".
    #   ws = the workspace object
    #
    def create_entity(self, entityName, entityType, ws):

        if entityType == "CAR":
            cfn_entity = twinmaker.CfnEntity(self, entityName,
                entity_name = entityName,
                workspace_id= ws.workspace_id,
                components= {
                    "EVDataComponentType": twinmaker.CfnEntity.ComponentProperty(
                        component_type_id="com.user.evtwindata",
                        properties={
                            "vehicleName": twinmaker.CfnEntity.PropertyProperty(
                                value= twinmaker.CfnEntity.DataValueProperty(
                                    string_value= entityName
                                )
                            )
                        },
                    ),
                },
                description="Vehicle",
                entity_id= entityName,
                parent_entity_id= "fleetEV", # TODO remove hardcode
            )

        #
        # Fleet entity
        #
        if entityType == "FLEET":
            cfn_entity = twinmaker.CfnEntity(self, entityName,
                entity_name = entityName,
                workspace_id= ws.workspace_id,
                components= {
                    "parameters": twinmaker.CfnEntity.ComponentProperty(
                        component_type_id="com.amazon.iottwinmaker.parameters",
                    )
                },
                description="Fleet",
                entity_id= entityName,
            )

        cfn_entity.node.add_dependency(ws)
        return cfn_entity
