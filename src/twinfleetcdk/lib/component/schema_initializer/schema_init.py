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

#
# Fleetwise measure names have '.' in them, which is currently not supported by Twinmaker rules.
# So replace them, along with other illegal characters.
#
ILLEGAL_CHARACTERS = ['#', '(', ')', ' ', '.']

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
    properties = {}
    
    # Prepare and execute query statement to TimeStream
    vehicleName = event['properties']['vehicleName']['value']['stringValue']
    
    try:
        query_string = f"SELECT  distinct vehicleName, measure_name, measure_value::double, measure_value::boolean, time" \
                       f" FROM {DATABASE_NAME}.{TABLE_NAME} " \
                       f" WHERE vehicleName = '{vehicleName}' " \
                       f" ORDER by time DESC" \
                       f" LIMIT 100"

        LOGGER.info('vehicleName: %s', vehicleName)
        

        query_result = QUERY_CLIENT.query(QueryString=query_string)
        #print(f"Query result={query_result}")

        column_info = query_result['ColumnInfo']
        num_rows = len(query_result['Rows'])

        if num_rows > 0:
            for row in query_result['Rows']:
                values = __parse_row(column_info, row)
                
                attr_name = values["measure_name"]
                current_property = {
                    'definition': {}
                }
                
                if values['measure_value::double'] != None:
                    current_property['definition']['dataType'] = { 'type': 'DOUBLE' }
                elif values['measure_value::boolean'] != None:
                    current_property['definition']['dataType'] = { 'type': 'BOOLEAN' }
                else:
                    LOGGER.error("Wrong measure_value type ")
 
                current_property['definition']['isTimeSeries'] = True
            
                # Some characters are not allowed to be present in property name
                attr_name = replace_illegal_character(attr_name)
                properties[attr_name] = current_property
            
                # Add other properties that have static metadata (if applicable)
        else:
            # no rows - use default schema
            print(f"No rows -- using default schema")
            default_schema = create_default_schema(vehicleName)
            return default_schema
           
    except Exception as e:
        print(f"Query exception: {e} -- using default schema")
        default_schema = create_default_schema(vehicleName)
        return default_schema

    # normal case
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
    if 'NullValue' in datum:
        return __parse_column_name(info), None
    else:
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

#
# Create a default schema for our use case to handle the condition where the 
# database has not been populated yet.
#
def create_default_schema(vehName):
    properties = {}
    properties["Vehicle_CurrentLocation_Latitude"] = create_default_schema_entry("Vehicle_CurrentLocation_Latitude", 0, True, "DOUBLE", True)
    properties["Vehicle_CurrentLocation_Longitude"] = create_default_schema_entry("Vehicle_CurrentLocation_Longitude", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_StateOfCharge_Displayed"] = create_default_schema_entry("Vehicle_Powertrain_Battery_StateOfCharge_Displayed", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_BatteryHeaterTemperature1"] = create_default_schema_entry("Vehicle_Powertrain_BatteryHeaterTemperature1", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_MinDeterioration"] = create_default_schema_entry("Vehicle_Powertrain_MinDeterioration", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_MinDeteriorationCellNo"] = create_default_schema_entry("Vehicle_Powertrain_MinDeteriorationCellNo", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_BatteryAvailableChargePower"] = create_default_schema_entry("Vehicle_Powertrain_Battery_BatteryAvailableChargePower", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_BatteryAvailableDischargePower"] = create_default_schema_entry("Vehicle_Powertrain_Battery_BatteryAvailableDischargePower", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_StateOfHealth"] = create_default_schema_entry("Vehicle_Powertrain_Battery_StateOfHealth", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_MinCellVoltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_MinCellVoltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_StateOfChargeBMS"] = create_default_schema_entry("Vehicle_Powertrain_Battery_StateOfChargeBMS", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_hasActiveDTC"] = create_default_schema_entry("Vehicle_Powertrain_Battery_hasActiveDTC", 0, True, "BOOLEAN", True)
    properties["Vehicle_Powertrain_Battery_Module_MinTemperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_MinTemperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_MaxTemperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_MaxTemperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_BatteryVoltageAuxillary"] = create_default_schema_entry("Vehicle_Powertrain_BatteryVoltageAuxillary", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_BatteryFanFeedback"] = create_default_schema_entry("Vehicle_Powertrain_BatteryFanFeedback", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_BatteryFanStatus"] = create_default_schema_entry("Vehicle_Powertrain_BatteryFanStatus", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_FanRunning"] = create_default_schema_entry("Vehicle_Powertrain_Battery_FanRunning", 0, True, "BOOLEAN", True)
    properties["Vehicle_Powertrain_NormalChargePort"] = create_default_schema_entry("Vehicle_Powertrain_NormalChargePort", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_RapidChargePort"] = create_default_schema_entry("Vehicle_Powertrain_RapidChargePort", 0, True, "DOUBLE", True)
    properties["Vehicle_TotalOperatingTime"] = create_default_schema_entry("Vehicle_TotalOperatingTime", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_MinCellVoltageCellNumber"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_MinCellVoltageCellNumber", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_MaxCellVoltageCellNumber"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_MaxCellVoltageCellNumber", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Charging_IsCharging"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Charging_IsCharging", 0, True, "BOOLEAN", True)
    properties["Vehicle_Powertrain_BMSMainRelay"] = create_default_schema_entry("Vehicle_Powertrain_BMSMainRelay", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_BMSIgnition"] = create_default_schema_entry("Vehicle_Powertrain_BMSIgnition", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_BatteryDCVoltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_BatteryDCVoltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_BatteryCurrent"] = create_default_schema_entry("Vehicle_Powertrain_Battery_BatteryCurrent", 0, True, "DOUBLE", True)

    properties["Vehicle_InCabinTemperature"] = create_default_schema_entry("Vehicle_InCabinTemperature", 0, True, "DOUBLE", True)
    properties["Vehicle_OutsideAirTemperature"] = create_default_schema_entry("Vehicle_OutsideAirTemperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Speed"] = create_default_schema_entry("Vehicle_Speed", 0, True, "DOUBLE", True)
    properties["Vehicle_Chassis_Axle_LeftFrontTirePressure"] = create_default_schema_entry("Vehicle_Chassis_Axle_LeftFrontTirePressure", 0, True, "DOUBLE", True)
    properties["Vehicle_Chassis_Axle_LeftFrontTireTemperature"] = create_default_schema_entry("Vehicle_Chassis_Axle_LeftFrontTireTemperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Chassis_Axle_LeftRearTirePressure"] = create_default_schema_entry("Vehicle_Chassis_Axle_LeftRearTirePressure", 0, True, "DOUBLE", True)
    properties["Vehicle_Chassis_Axle_LeftRearTireTemperature"] = create_default_schema_entry("Vehicle_Chassis_Axle_LeftRearTireTemperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Chassis_Axle_RightFrontTirePressure"] = create_default_schema_entry("Vehicle_Chassis_Axle_RightFrontTirePressure", 0, True, "DOUBLE", True)
    properties["Vehicle_Chassis_Axle_RightFrontTireTemperature"] = create_default_schema_entry("Vehicle_Chassis_Axle_RightFrontTireTemperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Chassis_Axle_RightRearTirePressure"] = create_default_schema_entry("Vehicle_Chassis_Axle_RightRearTirePressure", 0, True, "DOUBLE", True)
    properties["Vehicle_Chassis_Axle_RightRearTireTemperature"] = create_default_schema_entry("Vehicle_Chassis_Axle_RightRearTireTemperature", 0, True, "DOUBLE", True)




    properties["Vehicle_Powertrain_Battery_Module_1_Temperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_1_Temperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_2_Temperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_2_Temperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_3_Temperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_3_Temperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_4_Temperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_4_Temperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_5_Temperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_5_Temperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_6_Temperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_6_Temperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_7_Temperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_7_Temperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_8_Temperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_8_Temperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_9_Temperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_9_Temperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_10_Temperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_10_Temperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_11_Temperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_11_Temperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_12_Temperature"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_12_Temperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_1_Voltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_1_Voltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_2_Voltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_2_Voltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_3_Voltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_3_Voltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_4_Voltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_4_Voltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_5_Voltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_5_Voltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_6_Voltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_6_Voltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_7_Voltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_7_Voltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_8_Voltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_8_Voltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_9_Voltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_9_Voltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_10_Voltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_10_Voltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_11_Voltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_11_Voltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_12_Voltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_12_Voltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_Module_MaxCellVoltage"] = create_default_schema_entry("Vehicle_Powertrain_Battery_Module_MaxCellVoltage", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_Battery_StateOfCharge_Current"] = create_default_schema_entry("Vehicle_Powertrain_Battery_StateOfCharge_Current", 0, True, "DOUBLE", True)

    properties["Vehicle_Powertrain_BatteryMinTemperature"] = create_default_schema_entry("Vehicle_Powertrain_BatteryMinTemperature", 0, True, "DOUBLE", True)
    properties["Vehicle_Powertrain_BatteryMaxTemperature"] = create_default_schema_entry("Vehicle_Powertrain_BatteryMaxTemperature", 0, True, "DOUBLE", True)

    return {
        'properties': properties
    }
#
#
#
def create_default_schema_entry(measureName, measureValue, isTs, mType, isImported):
    entry = {}

    if isTs == False:
        if mType == "STRING":
            entry = { "definition": { "dataType": { "type": mType}, "isTimeSeries": isTs, "isImported": isImported }, 
                      "value": { "stringValue": measureValue } }
        if mType == "DOUBLE":
            entry = { "definition": { "dataType": { "type": mType}, "isTimeSeries": isTs, "isImported": isImported }, 
                      "value": { "doubleValue": measureValue } }
        if mType == "BOOLEAN":
            entry = { "definition": { "dataType": { "type": mType}, "isTimeSeries": isTs, "isImported": isImported }, 
                      "value": { "booleanValue": measureValue } }
        
    else:
        # don't initialize time series value
        entry = { "definition": { "dataType": { "type": mType}, "isTimeSeries": isTs, "isImported": isImported }}

    return entry

