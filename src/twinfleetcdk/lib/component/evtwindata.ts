// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'path';
import {
  aws_lambda as lambda,
  aws_iottwinmaker as twinmaker,
  aws_iam as iam,
  aws_logs as logs,
  Duration,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class EVDataComponent extends Construct {
  constructor(scope: Construct, id: string, workspace_id: string, dbname: string, dbtable: string) {
    super(scope, id);

    const TYPE = 'com.user.evtwindata';

    //const region = cdk.Aws.REGION;
    //const account = cdk.Aws.ACCOUNT_ID;

    // create role needed to access TimeStream DB
    //const LAMBDA_ROLE_NAME = "evtwin_data_reader_lambda_role";
    const data_reader_lambda_name = 'evtwin_data_reader';
    const schema_init_lambda_name = 'evtwin_schema_initializer';

    // Create an inline policy doc for the twinmaker_role
    /*
        const twinmaker_role_inline_policy = new iam.Policy(this, 'LambdaRole', {
            statements: [new iam.PolicyStatement({
            actions: [
                'logs:CreateLogGroup',
            ],
            resources: [`arn:aws:logs:${region}:${account}:*`],
            effect: iam.Effect.ALLOW,

            }), new iam.PolicyStatement({
            actions: [
                'logs:CreateLogStream',
                'logs:PutLogEvents',
            ],
            resources: [
                `arn:aws:logs:${region}:${account}:log-group:/aws/lambda/*:*`,
                `arn:aws:logs:${region}:${account}:log-group:/aws/lambda/*:*`
            ],
            effect: iam.Effect.ALLOW,

            })]
        });*/

    const lambda_role = new iam.Role(this, 'EVDataLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Example role...',
    });

    // add timestream r/o access to this role
    lambda_role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonTimestreamReadOnlyAccess'));
    lambda_role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));
    lambda_role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSLambda_ReadOnlyAccess'));


    // Set Env properties for Timestream database
    const DB_NAME = dbname;
    const TABLE_NAME = dbtable;

    /*const env_vars: lambda.CfnFunction.EnvironmentProperty = {
            variables: {
                TIMESTREAM_DATABASE_NAME: DB_NAME,
                TIMESTREAM_TABLE_NAME: TABLE_NAME
            },
        };
        */
    //
    // Create the data reader lambda
    //
    const data_reader_lambda = new lambda.Function(this, 'EVDataReaderLambda', {
      functionName: data_reader_lambda_name,
      code: lambda.Code.fromAsset(path.join(__dirname, 'data_reader')),
      handler: 'data_reader.data_reader_handler', // filename.handlername
      runtime: lambda.Runtime.PYTHON_3_8,
      role: lambda_role,
      timeout: Duration.minutes(1),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_DAY,
      environment: {
        TIMESTREAM_DATABASE_NAME: DB_NAME,
        TIMESTREAM_TABLE_NAME: TABLE_NAME,
      },
      layers: [
        new lambda.LayerVersion(this, 'udq_utils_layer', {
          code: lambda.Code.fromAsset(path.join(__dirname, 'udq_layer.zip')),
          compatibleRuntimes: [lambda.Runtime.PYTHON_3_8],
        }),
      ],
    });

    //
    // Create the schema init lambda
    //
    const schema_init_lambda = new lambda.Function(this, 'EVDataSchemaInitLambda', {
      functionName: schema_init_lambda_name,
      code: lambda.Code.fromAsset(path.join(__dirname, 'schema_initializer')),
      handler: 'schema_init.schema_init_handler',
      runtime: lambda.Runtime.PYTHON_3_9,
      role: lambda_role,
      timeout: Duration.minutes(1),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_DAY,
      environment: {
        TIMESTREAM_DATABASE_NAME: DB_NAME,
        TIMESTREAM_TABLE_NAME: TABLE_NAME,
      },
    });


    // create the component
    new twinmaker.CfnComponentType(
      this,
      'EVDataComponentType',
      {
        componentTypeId: TYPE,
        workspaceId: workspace_id,
        functions: {
          schemaInitializer: {
            implementedBy: {
              lambda: {
                arn: schema_init_lambda.functionArn,
              },
              isNative: false,
            },
          },
          dataReader: {
            implementedBy: {
              lambda: {
                arn: data_reader_lambda.functionArn,
              },
              isNative: false,
            },
          },
        },
        propertyDefinitions: {
          vehicleName: {
            dataType: { type: 'STRING' },
            isTimeSeries: false,
            isRequiredInEntity: true,
            isExternalId: false,
            isStoredExternally: false,
          },
        },
      });


  }
}
