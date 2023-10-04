# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 2021
# SPDX-License-Identifier: Apache-2.0

import logging
import boto3
import os
import json 

REQUEST_KEY_PROPERTIES = 'properties'
REQUEST_KEY_VEHICLE_NAME = 'vehicleName'
#REQUEST_KEY_VALUE = 'value'
REQUEST_KEY_VALUE_STRING = 'stringValue'

ILLEGAL_CHARACTERS = ['#', '(', ')', ' ']

# Configure logger
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

SESSION = boto3.Session()
QUERY_CLIENT = SESSION.client('timestream-query')

# retrieve database name and table name from Lambda environment variables
# check if running on Lambda
if os.environ.get("AWS_EXECUTION_ENV") is not None:
    DATABASE_NAME = os.environ['TIMESTREAM_DATABASE_NAME']
    TABLE_NAME = os.environ['TIMESTREAM_TABLE_NAME']
else:
    LOGGER.addHandler(logging.StreamHandler(sys.stdout))
    DATABASE_NAME = None
    TABLE_NAME = None

# ---------------------------------------------------------------------------
#   Sample implementation of an AWS IoT TwinMaker control plane Connector against TimeStream
#   queries property schema of a component
# ---------------------------------------------------------------------------


def schema_init_handler(event, context):
    #print(event)
    properties = {}
    
    # Prepare and execute query statement to TimeStream
    #vehicle_name = event['REQUEST_KEY_VALUE']
    vehicleName = event['properties']['vehicleName']['value']['stringValue']

    #print(f"vehicleName = {vehicleName}")
    
    try:
 
        #query_string = f"SELECT  distinct eventId, vehicleName, campaignName, measure_name, measure_value::bigint" \
        query_string = f"SELECT  distinct vehicleName, measure_name, measure_value::double" \
                       f" FROM {DATABASE_NAME}.{TABLE_NAME} " \
                       f" WHERE vehicleName = '{vehicleName}'" 

        LOGGER.info('vehicleName: %s', vehicleName)
        
        #print(f"\nQuery string = {query_string}")

        query_result = QUERY_CLIENT.query(QueryString=query_string)
        #print(f"\nQuery result = {query_result}")

        column_info = query_result['ColumnInfo']
        #print(f"ColumnInfo result = {column_info}")
        #print(f"Rows = {query_result['Rows']}")

        for row in query_result['Rows']:
            values = __parse_row(column_info, row)
            #print(f"Values = {values}")
                
            attr_name = values["measure_name"]
            current_property = {
                'definition': {}
            }
            
            if (attr_name == "NOT_USED_HERE"):  # currently no string type measures
                current_property['definition']['dataType'] = {
                    'type': 'STRING'
                }
            else:
                current_property['definition']['dataType'] = {
                    'type': 'DOUBLE'
                }
 
            current_property['definition']['isTimeSeries'] = True
            
            # Some characters are not allowed to be present in property name
            attr_name = replace_illegal_character(attr_name)
            properties[attr_name] = current_property
            
            # Add other properties that have static metadata (if applicable)

           
    except Exception as e:
        LOGGER.error("Query exception: %s", e)
        raise e

    return {
        'properties': properties
    }

def __parse_row(column_info, row):
        data = row['Data']
        row_output = {}
        for j in range(len(data)):
            info = column_info[j]
            datum = data[j]
            key,val = __parse_datum(info, datum)
            row_output[key] = val

        return row_output

def __parse_datum(info, datum):
    column_type = info['Type']
    return __parse_column_name(info), datum['ScalarValue']

def __parse_time_series(info, datum):
    time_series_output = []
    for data_point in datum['TimeSeriesValue']:
        time_series_output.append("{time=%s, value=%s}"
                                  % (data_point['Time'],
                                     __parse_datum(info['Type']['TimeSeriesMeasureValueColumnInfo'],
                                                        data_point['Value'])))
    return "[%s]" % str(time_series_output)

def __parse_column_name(info):
    if 'Name' in info:
        return info['Name']
    else:
        return ""

def __parse_array(array_column_info, array_values):
    array_output = []
    for datum in array_values:
        array_output.append(__parse_datum(array_column_info, datum))

    return "[%s]" % str(array_output)

def replace_illegal_character(attr_name):
    for illegal_char in ILLEGAL_CHARACTERS:
        attr_name = attr_name.replace(illegal_char, '_')
    return attr_name.replace('__', '_')


