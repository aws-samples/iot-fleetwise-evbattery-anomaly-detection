#!/usr/bin/env python3

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 2022
# SPDX-License-Identifier: Apache-2.0

import aws_cdk as cdk

from evfleet.evfleet_stack import EVFleetStack
from evfleet.ec2grafana_stack import EC2GrafanaStack

app = cdk.App()

EVFleetStack(app, "evtwin2")
EC2GrafanaStack(app, "evtwin-grafana")

app.synth()
