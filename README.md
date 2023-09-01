[![NPM version](https://badge.fury.io/js/cdk-aws-iotfleetwise.svg)](https://badge.fury.io/js/cdk-aws-iotfleetwise)
[![PyPI version](https://badge.fury.io/py/cdk-aws-iotfleetwise.svg)](https://badge.fury.io/py/cdk-aws-iotfleetwise)
[![release](https://github.com/aws-samples/cdk-aws-iotfleetwise/actions/workflows/release.yml/badge.svg)](https://github.com/aws-samples/cdk-aws-iotfleetwise/actions/workflows/release.yml)

# iot-fleetwise-evbattery-anomaly-detection

L2 CDK construct to provision AWS IoT Fleetwise

# Install

### Typescript

```sh
npm install iot-fleetwise-evbattery-anomaly-detection
```

[API Reference](doc/api-typescript.md)

#### Python

```sh
pip install iot-fleetwise-evbattery-anomaly-detection
```

[API Reference](doc/api-python.md)

## Getting started
To deploy a simple end-to-end example you can use the following commands

```sh
yarn install
projen && projen compile
npx cdk -a lib/integ.full.js deploy -c key_name=mykey
```
Where `mykey` is an existing keypair name present in your account.
The deploy takes about 15 mins mostly due to compilation of the IoT FleetWise agent in the
EC2 instance that simulate the vehicle. Once deploy is finshed, data will start to show up in your Timestream table.


## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more 
information.

## License

This code is licensed under the MIT-0 License. See the LICENSE file.
