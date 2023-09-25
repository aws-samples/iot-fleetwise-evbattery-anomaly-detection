# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from pkgutil import get_loader
from time import time
from aws_cdk import (
    aws_lambda as lambda_,
    aws_iottwinmaker as twinmaker,
    aws_iam as iam,
    Duration,
    aws_logs as logs,
    Stack,
)


from aws_cdk.aws_lambda_python_alpha import PythonFunction, PythonLayerVersion
from constructs import Construct
from os import path


class EVDataComponent(Construct):

    TYPE = "com.user.evtwindata"

    def lambda_name(lambda_type):
        DATA_READER_LAMBDA_NAME = "evsim_data_reader_2"
        SCHEMA_INITIALIZER_LAMBDA_NAME = "evsim_schema_initializer_2"
        if lambda_type == "DATA_READER":
            return DATA_READER_LAMBDA_NAME
        else:
            return SCHEMA_INITIALIZER_LAMBDA_NAME

    def __init__(
            self,
            scope: Construct,
            id: str,
            workspace_id: str,
            *,
            prefix=None,
        ):
        super().__init__(scope, id)

        region = Stack.of(self).region
        account = Stack.of(self).account

        # create role needed to access TimeStream DB
        LAMBDA_ROLE_NAME = "evsim_data_reader_lambda_role"
        data_reader_lambda_name = EVDataComponent.lambda_name("DATA_READER")
        schema_init_lambda_name = EVDataComponent.lambda_name("SCHEMA_INITIALIZER")

        lambda_role = iam.Role(
            self,
            "EVDataComponentLambdaRole",
            role_name= LAMBDA_ROLE_NAME,
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            inline_policies={
                "lambdaLogandTimeStreamRole": iam.PolicyDocument(
                    statements=[
                        iam.PolicyStatement(
                            actions=[
                                "logs:CreateLogGroup",
                            ],
                            resources=[
                                f"arn:aws:logs:{region}:{account}:*"
                            ],
                            effect=iam.Effect.ALLOW,
                        ),
                        iam.PolicyStatement(
                            actions=[
                                "logs:CreateLogStream",
                                "logs:PutLogEvents",
                            ],
                            resources=[
                                f"arn:aws:logs:{region}:{account}:log-group:/aws/lambda/{data_reader_lambda_name}:*",
                                f"arn:aws:logs:{region}:{account}:log-group:/aws/lambda/{schema_init_lambda_name}:*",
                            ],
                            effect=iam.Effect.ALLOW,
                        ),
                    ]
                )
            },
        )
        # add timestream ro access to this role
        lambda_role.add_managed_policy(iam.ManagedPolicy.from_aws_managed_policy_name("AmazonTimestreamReadOnlyAccess"))


        # create the data reader lambda function
        dir_path = path.dirname(path.realpath(__file__))
        lambda_data_reader = PythonFunction(
            self,
            "EVDataReaderLambda",
            function_name= EVDataComponent.lambda_name("DATA_READER"),
            
            entry=path.join(dir_path, "data_reader"),
            layers=[
                PythonLayerVersion(
                    self,
                    "udq_utils_layers",
                    entry=path.join(dir_path, "udq_helper_utils"),
                    compatible_runtimes=[lambda_.Runtime.PYTHON_3_9],
                )
            ],
            runtime=lambda_.Runtime.PYTHON_3_9,
            index="data_reader.py",
            handler="data_reader_handler",
            memory_size=256,
            role=lambda_role,
            timeout=Duration.minutes(1),
            log_retention=logs.RetentionDays.ONE_DAY,
            environment={ 
                "TIMESTREAM_DATABASE_NAME":"fw_ev_sim_db",
                "TIMESTREAM_TABLE_NAME":"fw_ev_sim_table"
            },
        )

        # create the schema initializer lambda
        lambda_schema_init = PythonFunction(
            self,
            "EVDataSchemaInitLambda",
            function_name= EVDataComponent.lambda_name("SCHEMA_INITIALIZER"),
            entry=path.join(dir_path, "schema_init"),
            runtime=lambda_.Runtime.PYTHON_3_9,
            index="schema_init.py",
            handler="schema_init_handler",
            memory_size=256,
            role=lambda_role,
            timeout=Duration.minutes(1),
            log_retention=logs.RetentionDays.ONE_DAY,
            environment={ 
                "TIMESTREAM_DATABASE_NAME":"fw_ev_sim_db",
                "TIMESTREAM_TABLE_NAME":"fw_ev_sim_table"
            }
        )

        # create the component
        twinmaker.CfnComponentType(
            self,
            "EVDataComponentType",
            component_type_id=self.TYPE,
            workspace_id=workspace_id,
            functions={
                "schemaInitializer": {
                  "implementedBy": {
                    "lambda": {
                      "arn": lambda_schema_init.function_arn
                    },
                    "isNative": False
                  },
                  "isInherited": False
                },
                "dataReader": {
                    "implementedBy": {
                        "lambda": {
                          "arn": lambda_data_reader.function_arn
                        },
                        "isNative": False,
                    },
                    "isInherited": False,
                }
            },
            property_definitions={
                "vehicleName": {
                    "dataType": {"type": "STRING"},
                    "isTimeSeries": False,
                    "isRequiredInEntity": True,
                    "isExternalId": False,
                    "isStoredExternally": False,
                    "isImported": False,
                    "isFinal": False,
                    "isInherited": False,
                }
            }
        )
