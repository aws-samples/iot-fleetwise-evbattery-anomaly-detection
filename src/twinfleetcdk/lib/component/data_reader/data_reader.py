# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 2021
# SPDX-License-Identifier: Apache-2.0

import logging
import os
import sys
from datetime import datetime

import boto3

from udq_utils.udq import SingleEntityReader, MultiEntityReader, IoTTwinMakerDataRow, IoTTwinMakerUdqResponse
from udq_utils.udq_models import IoTTwinMakerUDQEntityRequest, IoTTwinMakerUDQComponentTypeRequest, OrderBy, IoTTwinMakerReference, \
    EntityComponentPropertyRef, ExternalIdPropertyRef

#from udq_utils.sql_detector import SQLDetector

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
#   Implementation of the AWS IoT TwinMaker UDQ Connector for Amazon Timestream
#   consists of the EntityReader and IoTTwinMakerDataRow implementations
# ---------------------------------------------------------------------------

class TimestreamReader(SingleEntityReader):
    """
    The UDQ Connector implementation for our Timestream table
    It supports both single-entity queries and multi-entity queries and contains 2 utility functions to read from Timestream
    and convert the results into a IoTTwinMakerUdqResponse object
    """
    def __init__(self, query_client, database_name, table_name):
        self.query_client = query_client
        self.database_name = database_name
        self.table_name = table_name
        #self.sqlDetector = SQLDetector()

    # overrides SingleEntityReader.entity_query abstractmethod
    def entity_query(self, request: IoTTwinMakerUDQEntityRequest) -> IoTTwinMakerUdqResponse:
        """
        This is a entityId.componentName.propertyId type query.
        The entityId and componentName is resolved into the externalIds for this component so we are getting vehicleName passed in
        Select all entries matching the passed in vehicleName and additional filters
        """
        LOGGER.info("TimestreamReader entity_query")

        requestd = vars(request)
        
        selected_properties = request.selected_properties
     
        property_filter = request.property_filters if request.property_filters else None
        if property_filter:
            print(f"\nProperty Filter  = {property_filter}")
            #
            # Workaround for twinmaker restriction - in name, replace '_' with '.' to map back to fleetwise names
            #
            filter_property_name = property_filter[0]['propertyName'].replace('_', '.')
            filter_property_operator = property_filter[0]['operator']
            if 'doubleValue' in property_filter[0]['value']:
                filter_property_value = property_filter[0]['value']['doubleValue']
            elif 'booleanValue' in property_filter[0]['value']:
                filter_property_value = property_filter[0]['value']['booleanValue']
            else:
                print(f"\nUnhandled filter value type")
            filter_clause = f"AND measure_name = '{filter_property_name}' AND measure_value::double {filter_property_operator} {filter_property_value}"

            #print(f"\nFilter clause  = {filter_clause}")
        else:
            filter_clause = ""


        vehicleName = request.udq_context['properties']['vehicleName']['value']['stringValue']

        sample_sel_properties = [f"p{x}" for x in range(0, len(selected_properties))] # e.g. "p0", "p1", ...

        sample_measure_name_clause = " OR ".join([f"measure_name = '{x}'" for x in sample_sel_properties])

        #
        # Workaround for '.' in property/measure name.  Restore all occurrences of _ in the measure name
        # with '.' so the query to Timestream works.
        #
        for index, item in enumerate(selected_properties):
            newitem  = item.replace('_', '.')
            selected_properties[index] = newitem

        measure_name_clause = " OR ".join([f"measure_name = '{x}'" for x in selected_properties])

        #if property_filter:
          #  sample_query = f"SELECT vehicleName, campaignName, measure_name, time, measure_value::bigint FROM {self.database_name}.{self.table_name} WHERE vehicleName = vehicleName AND measure_value::varchar {property_filter['operator']} 'abc' ORDER BY time ASC LIMIT 18"
        #else:
         #   sample_query = f"SELECT vehicleName, campaignName, measure_name, time, measure_value::bigint FROM {self.database_name}.{self.table_name} WHERE vehicleName = vehicleName ORDER BY time ASC LIMIT 18"

        query_string = f"SELECT vehicleName, campaignName, measure_name, time, measure_value::boolean, measure_value::double" \
                       f" FROM {self.database_name}.{self.table_name}" \
                       f""" WHERE time > from_iso8601_timestamp('{request.start_time}')""" \
                       f""" AND time <= from_iso8601_timestamp('{request.end_time}')""" \
                       f" AND vehicleName = '{vehicleName}'" \
                       f" AND ({measure_name_clause})" \
                       f" {filter_clause}" \
                       f" ORDER BY time {'ASC' if request.order_by == OrderBy.ASCENDING else 'DESC'}" 
        # ignore sql injection checks for now
        # self.sqlDetector.detectInjection(sample_query, query_string)

        page = self._run_timestream_query(query_string, request.next_token, request.max_rows)

        return self._convert_timestream_query_page_to_udq_response(page, request.entity_id, request.component_name)


    def _run_timestream_query(self, query_string, next_token, max_rows) -> dict:
        """
        Utility function: handles executing the given query_string on AWS Timestream. Returns an AWS Timestream Query Page
        see https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/timestream-query.html#TimestreamQuery.Client.query
        """
        #LOGGER.info("Query string is %s", query_string)
        try:
            # Timestream SDK returns error if None is passed for NextToken and MaxRows
            if next_token and max_rows:
                page = self.query_client.query(QueryString=query_string, NextToken=next_token, MaxRows=max_rows)
            elif next_token:
                page = self.query_client.query(QueryString=query_string, NextToken=next_token)
            elif max_rows:
                page = self.query_client.query(QueryString=query_string, MaxRows=max_rows)
                # skip empty pages returned by Timestream
                # passing in MaxRows but no NextToken, if we have more than MaxRows available we get back a NextToken and no results, and reissue the query
                while 'NextToken' in page and len(page['Rows']) == 0:
                    page = self.query_client.query(QueryString=query_string, NextToken=page['NextToken'], MaxRows=max_rows)
            else:
                page = self.query_client.query(QueryString=query_string)

            #print(f"Result page = {page}")
            return page

        except Exception as err:
            LOGGER.error("Exception while running query: %s", err)
            raise err

    @staticmethod
    def _convert_timestream_query_page_to_udq_response(query_result_page, entity_id, component_name):
        """
        Utility function: handles converting an AWS Timestream Query Result Page into a IoTTwinMakerUdqResponse object
        For each IoTTwinMakerDataRow, we include:
        - the raw row data from Timestream after incorporating the workaround mentioned below
        - the column schema from Timestream we can later use to interpret the row
        - and the entity_id, component_name as context for constructing the entityPropertyReference
        """
        #LOGGER.info("Query result is %s", query_page)
        #
        # Workaround for '.' in property/measure name.  Restore all occurrences of '.' in the measure name
        # with '_' so the API issuer request and response are matched.  This is done only for measure names 
        #
        converted_rows = []
        schema = query_result_page['ColumnInfo']
        for row in query_result_page['Rows']:
            raw_row = TimestreamDataRow(row, schema, entity_id, component_name)
            
            # replace '_' with '.'
            converted_name = raw_row._row_as_dict['measure_name'].replace('.', '_')
            raw_row._row_as_dict['measure_name'] = converted_name
            converted_rows.append(raw_row)

        # return udq response
        return IoTTwinMakerUdqResponse(converted_rows, query_result_page.get('NextToken'))


class TimestreamDataRow(IoTTwinMakerDataRow):
    """
    The AWS IoT TwinMaker data row implementation for our Timestream data

    It supports the IoTTwinMakerDataRow interface to:
    - calculate the IoTTwinMakerReference ("entityPropertyReference") for a Timestream row
    - extract the timestamp from a Timestream row
    - extract the value from a Timestream row
    """

    def __init__(self, timestream_row, timestream_column_schema, entity_id=None, component_name=None, _vehicle_name=None):
        self._timestream_row = timestream_row
        self._timestream_column_schema = timestream_column_schema
        self._row_as_dict = self._parse_row(timestream_column_schema, timestream_row)
        self._entity_id = entity_id
        self._component_name = component_name
        self._vehicle_name = _vehicle_name

    # overrides IoTTwinMakerDataRow.get_iottwinmaker_reference abstractmethod
    def get_iottwinmaker_reference(self) -> IoTTwinMakerReference:
        """
        This function calculates the IoTTwinMakerReference ("entityPropertyReference") for a Timestream row

        For single-entity queries, the entity_id and component_name values are passed in, use those to construct the 'EntityComponentPropertyRef'
        """
        property_name = self._row_as_dict['measure_name']
        return IoTTwinMakerReference(ecp=EntityComponentPropertyRef(self._entity_id, self._component_name, property_name))

    # overrides IoTTwinMakerDataRow.get_iso8601_timestamp abstractmethod
    def get_iso8601_timestamp(self) -> str:
        """
        This function extracts the timestamp from a Timestream row and returns in ISO8601 basic format
        e.g. '2022-04-06 00:17:45.419000000' -> '2022-04-06T00:17:45.419000000Z'
        """
        return self._row_as_dict['time'].replace(' ', 'T') + 'Z'

    # overrides IoTTwinMakerDataRow.get_value abstractmethod
    def get_value(self):
        """
        This function extracts the value from a Timestream row

        Check for supported types. We return the value back as a native python type
        """
        if 'measure_value::varchar' in self._row_as_dict and self._row_as_dict['measure_value::varchar'] is not None:
            return self._row_as_dict['measure_value::varchar']
        elif 'measure_value::double' in self._row_as_dict and self._row_as_dict['measure_value::double'] is not None:
            return float(self._row_as_dict['measure_value::double'])
        elif 'measure_value::bigint' in self._row_as_dict and self._row_as_dict['measure_value::bigint'] is not None:
            return float(self._row_as_dict['measure_value::bigint'])
        elif 'measure_value::boolean' in self._row_as_dict and self._row_as_dict['measure_value::boolean'] is not None:
            boolval = self._row_as_dict['measure_value::boolean']

            # convert the boolean to float to work around a twinmaker model shader 'limitation'
            if (boolval == 'true'):
                return float(1)
            else:
                return float(0)
        else:
            print("\nUnhandled type")
            raise ValueError(f"Unhandled type in timestream row: {self._row_as_dict}")

    def _parse_row(self, column_schema, timestream_row):
        """
        Utility function: parses a timestream row into a python dict for more convenient field access

        Example:
        column=[
            {'Name': 'vehicleName', 'Type': {'ScalarType': 'VARCHAR'}},
            {'Name': 'measure_name', 'Type': {'ScalarType': 'VARCHAR'}},
            {'Name': 'time', 'Type': {'ScalarType': 'TIMESTAMP'}},
            {'Name': 'measure_value::double', 'Type': {'ScalarType': 'DOUBLE'}},
            {'Name': 'measure_value::varchar', 'Type': {'ScalarType': 'VARCHAR'}}
        ]
        row={'Data': [
            {'ScalarValue': 'Mixer_15_7e3c0bdf-3b1c-46b9-886b-14f9d0b9df4d'},
            {'ScalarValue': 'alarm_status'},
            {'ScalarValue': '2021-10-15 20:45:43.287000000'},
            {'NullValue': True},
            {'ScalarValue': 'ACTIVE'}
        ]}

        ->

        {
            'vehicleName': 'Mixer_15_7e3c0bdf-3b1c-46b9-886b-14f9d0b9df4d',
            'measure_name': 'alarm_status',
            'time': '2021-10-15 20:45:43.287000000',
            'measure_value::double': None,
            'measure_value::varchar': 'ACTIVE'
        }
        """
        data = timestream_row['Data']
        result = {}
        for i in range(len(data)):
            info = column_schema[i]
            datum = data[i]
            key, val = self._parse_datum(info, datum)
            result[key] = val
        return result

    @staticmethod
    def _parse_datum(info, datum):
        """
        Utility function: parses timestream datum entries into (key,value) tuples. Only ScalarTypes currently supported.

        Example:
        info={'Name': 'time', 'Type': {'ScalarType': 'TIMESTAMP'}}
        datum={'ScalarValue': '2021-10-15 20:45:25.793000000'}

        ->

        ('time', '2021-10-15 20:45:25.793000000')
        """
        if datum.get('NullValue', False):
            return info['Name'], None
        column_type = info['Type']
        if 'ScalarType' in column_type:
            return info['Name'], datum['ScalarValue']
        else:
            raise Exception(f"Unsupported columnType[{column_type}]")


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

TIMESTREAM_UDQ_READER = TimestreamReader(QUERY_CLIENT, DATABASE_NAME, TABLE_NAME)

#
# Main Lambda invocation entry point, use the TimestreamReader to process events
# noinspection PyUnusedLocal
#
def data_reader_handler(event, context):
    #LOGGER.info('Event: %s', event)
    result = TIMESTREAM_UDQ_READER.process_query(event)
    return result
    



