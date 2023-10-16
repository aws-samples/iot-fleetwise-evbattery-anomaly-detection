import { readFileSync } from 'fs';
import * as path from 'path';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import { Construct } from 'constructs';
export function CreateEc2ImageUpdater(
  stack: Construct,
  imageSsmParameterKey: string,
  clusterStackName: string,
  ec2Architecture: string,
  baseImage: string,
): CfnInclude {
  //const path = require('path');
  // Read the bash script as string. Note we have to insert Indentation properly to match cloudformation yaml file format.
  const setupCommands =
    '|\n' +
    ' '.repeat(14) +
    readFileSync(
      path.resolve(
        __dirname,
        `ec2-setup-scripts/${baseImage}/ec2-ami-setup.sh`,
      ),
      'utf8',
    ).replace(/[\r\n]+/g, '\n' + ' '.repeat(14));

  const ec2ImageBuilder = new CfnInclude(stack, 'ec2-image-updater', {
    templateFile: path.resolve(__dirname, 'ec2-image-updater.yaml'),
    preserveLogicalIds: false,
    parameters: {
      ImageSsmParameterKey: imageSsmParameterKey,
      ClusterStackName: clusterStackName,
      Ec2Architecture: ec2Architecture,
      SetupCommands: setupCommands,
      // Important! If you modify EC2 Image Builder Component or Image Recipe, you need to increase the version.
      // Otherwise, the CDK deployment will fail due to limitation from EC2 Image Builder CDK update policy.
      Ec2ImageBuilderVersion: '2',
    },
  });
  return ec2ImageBuilder;
}
