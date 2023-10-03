import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Handler } from './handler';
import { Provider } from './provider';
import { Vehicle } from './vehicle';

enum dataFormat {
  JSON,
  PARQUET
}

enum storageCompressionFormat {
  NONE,
  GZIP
}

export enum triggerMode {
  ALWAYS,
  RISING_EDGE
}

export class CollectionScheme {
  protected scheme: object;

  constructor() {
    this.scheme = {};
  }

  toObject(): object {
    return (this.scheme);
  }
}

export class DestinationConfig {
  private destination: object;

  constructor() {
    this.destination = {};
  }

  toObject(): object {
    return (this.destination);
  }
}

export class TimeBasedCollectionScheme extends CollectionScheme {
  constructor(
    period: cdk.Duration,
  ) {
    super();

    this.scheme = {
      timeBasedCollectionScheme: {
        periodMs: period.toMilliseconds(),
      },
    };
  }
}

export class ConditionBasedCollectionScheme extends CollectionScheme {
  constructor(
    expression: string,
    conditionLanguageVersion?: number,
    minimumTriggerIntervalMs?: number, 
    triggerMode?: triggerMode
  ) {
    super();

    this.scheme = {
      conditionBasedCollectionScheme: {
        expression,
        ...conditionLanguageVersion && { conditionLanguageVersion },
        ...minimumTriggerIntervalMs && { minimumTriggerIntervalMs },
        ...triggerMode && { triggerMode }
      },
    };
  }
}

export class CampaignSignal {
  private signal: object;
  constructor(
    name: string,
    maxSampleCount?: number,
    minimumSamplingInterval?: cdk.Duration) {

    this.signal = {
      name,
      ...maxSampleCount && { maxSampleCount },
      ...minimumSamplingInterval && { minimumSamplingInterval },
    };
  }

  toObject(): object {
    return (this.signal);
  }
}

export class TimeStreamDestinationConfig extends DestinationConfig {
  public timestreamConfig: object;
  constructor(
    executionRoleArn: string,
    timestreamTableArn: string) {

    super();
    this.timestreamConfig = {
        timestreamConfig:  {
      ...executionRoleArn && { executionRoleArn },
      ...timestreamTableArn && { timestreamTableArn }
      },
    }
  }

  toObject(): object {
    return (this.timestreamConfig);
  }
}

export class S3DestinationConfig extends DestinationConfig {
  private s3Config: object;
  constructor(
    bucketArn: string,
    dataFormat: dataFormat,
    prefix: string,
    storageCompressionFormat: storageCompressionFormat) {
  
      super();

    this.s3Config = {
      s3Config: {
      bucketArn,
      ...dataFormat && { dataFormat },
      ...prefix && { prefix },
      ...storageCompressionFormat && {storageCompressionFormat}
      },
    }
  }

  toObject(): object {
    return (this.s3Config);
  }
}

export interface CampaignProps {
  readonly name: string;
  readonly description: string;
  readonly compression: string;
  readonly diagnosticsMode: string;
  readonly spoolingMode: string;
  readonly target: Vehicle;
  readonly collectionScheme: CollectionScheme;
  readonly signals: CampaignSignal[];
  readonly dataDestinationConfigs: DestinationConfig[];
  readonly autoApprove?: boolean;
}

export class Campaign extends Construct {
  readonly name: string = '';
  readonly description: string = '';
  readonly arn: string = '';
  readonly compression: string = '';
  readonly diagnosticsMode: string = '';
  readonly spoolingMode: string = '';
  readonly target: Vehicle = ({} as Vehicle);

  constructor(scope: Construct, id: string, props: CampaignProps) {
    super(scope, id);

    (this.name as string) = props.name;
    (this.compression as string) = props.compression;
    (this.diagnosticsMode as string) = props.diagnosticsMode;
    (this.spoolingMode as string) = props.spoolingMode;

    this.arn = `arn:aws:iotfleetwise:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:vehicle/${props.target}`;
    (this.target as Vehicle) = props.target;

    const handler = new Handler(this, 'Handler', {
      handler: 'campaignhandler.on_event',
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      serviceToken: Provider.getOrCreate(this, handler).provider.serviceToken,
      properties: {
        name: this.name,
        description: this.description,
        signal_catalog_arn: this.target.vehicleModel.signalCatalog.arn,
        target_arn: this.target.arn,
        compression: this.compression,
        diagnosticsMode: this.diagnosticsMode,
        spoolingMode: this.spoolingMode,
        dataDestinationConfigs: JSON.stringify(props.dataDestinationConfigs.map(s => s.toObject())),
        collection_scheme: JSON.stringify(props.collectionScheme.toObject()),
        signals_to_collect: JSON.stringify(props.signals.map(s => s.toObject())),
        auto_approve: props.autoApprove || false,
      },
    });
    resource.node.addDependency(this.target);
  }
}