// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 2022
// SPDX-License-Identifier: Apache-2.0

import {
  aws_s3 as s3,
  aws_iottwinmaker as twinmaker,
  aws_s3_deployment as s3deploy,
  aws_iam as iam,
  RemovalPolicy,
  CfnOutput, Environment, Stack,
} from 'aws-cdk-lib';
import { CfnEntity } from 'aws-cdk-lib/aws-iottwinmaker';
import { Construct } from 'constructs';
import { EVDataComponent } from './component/evtwindata';
import { SceneModel } from './scene';

export interface TwinfleetStackProps {
  env: Environment;
  databaseName: string;
  tableName: string;
}
//
// Stack for TwinMaker related items
//
export class TwinfleetStack extends Stack {
  //
  constructor(scope: Construct, id: string, props: TwinfleetStackProps) {
    super(scope, id, props);

    // Save account and region for later use

    const S3_BUCKET_NAME = `twinfleet-bucket-${this.account}-${this.region}`;
    const WS_ID: string = 'twin';
    const SCENE_ID_FLEET: string = 'evfleetview';
    const SCENE_ID_INSPECTION: string = 'inspectionview';
    const sceneKeyFleet: string = 'scene/evfleet.json';
    const sceneKeyInspection: string = 'scene/inspectionview.json';

    // create fleet (parent) entity
    const fleet_name = 'FleetEV';

    // Create an S3 bucket for the TwinMaker Workspace
    let twinfleet_bucket = new s3.Bucket(this, S3_BUCKET_NAME, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT, s3.HttpMethods.DELETE, s3.HttpMethods.HEAD],
        allowedOrigins: ['*'],

        // the properties below are optional
        allowedHeaders: ['*'],
      }],
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // export the bucket as an output of the stack
    new CfnOutput(this, 'twinfleet-bucket-arn', { value: twinfleet_bucket.bucketArn, exportName: 'twinfleet-bucket-arn' });

    // Create an inline policy doc for the twinmaker_role
    const twinmaker_role_inline_policy = new iam.Policy(this, 'TwinMakerRoleInlinePolicy', {
      statements: [new iam.PolicyStatement({
        actions: [
          's3:ListBucket',
          's3:GetBucket*',
          's3:GetObject',
          's3:PutObject',
        ],
        resources: [twinfleet_bucket.bucketArn, `${twinfleet_bucket.bucketArn}/*`],
        effect: iam.Effect.ALLOW,

      }), new iam.PolicyStatement({
        actions: [
          'lambda:invokeFunction',
        ],
        resources: [`arn:aws:lambda:${this.region}:${this.account}:function:*`],
        effect: iam.Effect.ALLOW,

      }), new iam.PolicyStatement({
        actions: [
          'iottwinmaker:Get*',
          'iottwinmaker:List*',
        ],
        resources: [`arn:aws:iottwinmaker:${this.region}:${this.account}:workspace/*`],
        effect: iam.Effect.ALLOW,

      }), new iam.PolicyStatement({
        actions: [
          'iottwinmaker:ListWorkspaces',
        ],
        resources: ['*'],
        effect: iam.Effect.ALLOW,

      }), new iam.PolicyStatement(
        {
          effect: iam.Effect.ALLOW,
          actions: [
            's3:DeleteObject',
          ],
          resources: [
            `arn:aws:s3:::${S3_BUCKET_NAME}/DO_NOT_DELETE_WORKSPACE_*`,
          ],
        })],

    });

    // Create a role to be used by the TwinMaker Workspace
    const twinmaker_role = new iam.Role(this, 'TwinMakerRole', {
      assumedBy: new iam.ServicePrincipal('iottwinmaker.amazonaws.com'),
      description: 'TwinMaker service role...',
    });
    twinmaker_role.attachInlinePolicy(twinmaker_role_inline_policy);

    // Create the Workspace
    const workspace = new twinmaker.CfnWorkspace(this, 'TwinMakerWorkspace', {
      role: twinmaker_role.roleArn,
      s3Location: twinfleet_bucket.bucketArn,
      workspaceId: WS_ID,
      description: 'TwinMaker workspace representing the EV Fleet',
    });

    // add the stack resource dependencies
    workspace.node.addDependency(twinmaker_role);
    workspace.node.addDependency(twinfleet_bucket);

    // Create the com.user.evtwindata component
    const evdatacomponent = new EVDataComponent(this, 'EVDataComp', WS_ID, props.databaseName, props.tableName);
    evdatacomponent.node.addDependency(workspace);

    // derive the bucket url
    const fleetjsonfile = '/scene/evfleet.json';
    const content_url_fleet = twinfleet_bucket.s3UrlForObject(`${fleetjsonfile}`);
    //new CfnOutput(this, 'contenturlfleet', { value: content_url_fleet, exportName: 'contenturlfleet' });
    
    const url_parts:string[] = content_url_fleet.split(fleetjsonfile); 
    const bucket_url = url_parts[0];
    //new CfnOutput(this, 'bucketurlfleet', { value: bucket_url, exportName: 'bucketurlfleet' });

    // create the scene model

    // 9/2023 - twinmaker has some issues if there are too many children associated with a parent.
    //          This is a deployment time issue.
    //          This is expected to be resolved in a couple of months.  Have not seen this issue with
    //          python, only with typescript.
    const VEHICLES_IN_FLEET: number = 20;
    const VEHICLE_BASE_NUMBER = 101;

    // Create the Fleet View scene
    let scene = new SceneModel('FLEETVIEW', VEHICLES_IN_FLEET, VEHICLE_BASE_NUMBER, bucket_url);
    const scene_json = JSON.stringify(scene.scene_model);

    // Create the Inspection View scene with 1 vehicle
    let scene_iview = new SceneModel('INSPECTIONVIEW', 1, VEHICLE_BASE_NUMBER, bucket_url);
    const scene_iview_json = JSON.stringify(scene_iview.scene_model);

    // upload the json for both scenes to the S3 Bucket
    const deployment = new s3deploy.BucketDeployment(this,
	    'DeployFleetView', {
	        sources: [
                  s3deploy.Source.asset('./src/twinfleetcdk/resources'),
		            s3deploy.Source.data(sceneKeyFleet, scene_json),
                  s3deploy.Source.data(sceneKeyInspection, scene_iview_json),
                ],
	        destinationBucket: twinfleet_bucket,
	    });


    // create the scene in the TwinMaker Workspace.  

    twinfleet_bucket.grantReadWrite(twinmaker_role);

    const fleet_scene = new twinmaker.CfnScene(this, 'FleetScene', {
      sceneId: SCENE_ID_FLEET,
      workspaceId: WS_ID,
      contentLocation: content_url_fleet, 
    });

    fleet_scene.node.addDependency(deployment);

    const inspectionjsonfile = 'scene/inspectionview.json';
    const content_url_iview = twinfleet_bucket.s3UrlForObject(`${inspectionjsonfile}`);

    const inspection_scene = new twinmaker.CfnScene(this, 'InspectionScene', {
      sceneId: SCENE_ID_INSPECTION,
      workspaceId: WS_ID,
      contentLocation: content_url_iview, 
    });

    inspection_scene.node.addDependency(deployment);

    // create entities
    let fleet_entity = this.create_entity(fleet_name, 'FLEET', workspace.workspaceId);
    if (fleet_entity != null) {
      fleet_entity.node.addDependency(workspace);
    }

    // create entities for the vehicles

    for (let i = VEHICLE_BASE_NUMBER; i < VEHICLES_IN_FLEET + VEHICLE_BASE_NUMBER ; i++) {
      let vehicle_name = `KNADE163966083${i}`;
      let car_entity = this.create_entity(vehicle_name, 'CAR', workspace.workspaceId);
      if ((car_entity != null) && fleet_entity != null) {
        car_entity.node.addDependency(fleet_entity);
        car_entity.node.addDependency(fleet_scene);
        car_entity.node.addDependency(evdatacomponent);
        car_entity.node.addDependency(workspace);
      }
    }
  }
  /*
   * create_entity
   *   entityName = name of the entity
   *   entityType = a string holding the entity type.  Must be "CAR" or "FLEET".
   *   ws = the workspace object
   * Returns: a CfnEntity object or null if the entity type is invalid
   */
  create_entity(entityName: string, entityType: string, wsID: string ): CfnEntity | null {

    let cfn_entity: any;

    if (entityType == 'CAR') {
      cfn_entity = new twinmaker.CfnEntity(this, entityName, {
        entityName: entityName,
        workspaceId: wsID,
        components: {
          EVDataComp: {
            componentName: 'evdata',
            componentTypeId: 'com.user.evtwindata',
            properties: {
              vehicleName: {
                value: {
                  stringValue: entityName,
                },
              },
            },
          },
        },
        description: 'Car',
        entityId: entityName,

        parentEntityId: 'FleetEV',
      });
    } else {
      if (entityType == 'FLEET') {

        // Fleet entity
        cfn_entity = new twinmaker.CfnEntity(this, entityName, {
          entityName: entityName,
          workspaceId: wsID,
          components: {
            parameters: {
              componentName: 'Attributes',
              componentTypeId: 'com.amazon.iottwinmaker.parameters',
            },
          },
          description: 'Fleet',
          entityId: entityName,
        });
      } else {
        // invalid
        console.log(`Invalid entity type ${entityType} ${entityName}`);
        return null;
      }
    }

    return cfn_entity;
  }
}

