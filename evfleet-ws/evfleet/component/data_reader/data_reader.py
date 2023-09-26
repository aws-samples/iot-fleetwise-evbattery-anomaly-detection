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

from udq_utils.sql_detector import SQLDetector

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
#   Implementation of the AWS IoT TwinMaker UDQ Connector for Amazon Timestream
#   consists of the EntityReader and IoTTwinMakerDataRow implementations
# ---------------------------------------------------------------------------


class TimestreamReader(SingleEntityReader, MultiEntityReader):
    """
    The UDQ Connector implementation for our Timestream table
    It supports both single-entity queries and multi-entity queries and contains 2 utility functions to read from Timestream
    and convert the results into a IoTTwinMakerUdqResponse object
    """
    def __init__(self, query_client, database_name, table_name):
        self.query_client = query_client
        self.database_name = database_name
        self.table_name = table_name
        self.sqlDetector = SQLDetector()

    # overrides SingleEntityReader.entity_query abstractmethod
    def entity_query(self, request: IoTTwinMakerUDQEntityRequest) -> IoTTwinMakerUdqResponse:
        """
        This is a entityId.componentName.propertyId type query.
        The entityId and componentName is resolved into the externalIds for this component so we are getting vehicleName passed in
        Select all entries matching the passed in vehicleName and additional filters
        """
        LOGGER.info("TimestreamReader entity_query")

        requestd = vars(request)
        #print("\nRequest = ")
        #print(requestd)
        
        #print(f"\nRequest udq= {request.udq_context} ")
        
        selected_properties = request.selected_properties
        print(f"Selected properties = {request.selected_properties}")
        property_filter = request.property_filters if request.property_filters else None
        if property_filter:
            print(f"\nProperty Filter  = {property_filter}")
            filter_property_name = property_filter[0]['propertyName']
            filter_property_operator = property_filter[0]['operator']
            filter_property_value = property_filter[0]['value']['doubleValue']
            filter_clause = f"AND measure_name = '{filter_property_name}' {filter_property_operator} {filter_property_value}"
            #filter_clause = f"AND (measure_name = {property_filter['propertyName']} AND measure_value::varchar {property_filter['operator']} '{property_filter['value']['doubleValue']}')" if property_filter else ""

            print(f"\nFilter clause  = {filter_clause}")
        else:
            filter_clause = ""


        vehicleName = request.udq_context['properties']['vehicleName']['value']['stringValue']
        print(f"\nVehicle name = {vehicleName}")

        sample_sel_properties = [f"p{x}" for x in range(0, len(selected_properties))] # e.g. "p0", "p1", ...
        #print(f"\nSample Sel properties {sample_sel_properties}")
        sample_measure_name_clause = " OR ".join([f"measure_name = '{x}'" for x in sample_sel_properties])
        measure_name_clause = " OR ".join([f"measure_name = '{x}'" for x in selected_properties])
        #if property_filter:
          #  sample_query = f"SELECT vehicleName, campaignName, measure_name, time, measure_value::bigint FROM {self.database_name}.{self.table_name} WHERE vehicleName = vehicleName AND measure_value::varchar {property_filter['operator']} 'abc' ORDER BY time ASC LIMIT 18"
        #else:
         #   sample_query = f"SELECT vehicleName, campaignName, measure_name, time, measure_value::bigint FROM {self.database_name}.{self.table_name} WHERE vehicleName = vehicleName ORDER BY time ASC LIMIT 18"

        query_string = f"SELECT vehicleName, campaignName, measure_name, time, measure_value::double" \
                       f" FROM {self.database_name}.{self.table_name}" \
                       f""" WHERE time > from_iso8601_timestamp('{request.start_time}')""" \
                       f""" AND time <= from_iso8601_timestamp('{request.end_time}')""" \
                       f" AND vehicleName = '{vehicleName}'" \
                       f" AND ({measure_name_clause})" \
                       f" {filter_clause}" \
                       f" ORDER BY time {'ASC' if request.order_by == OrderBy.ASCENDING else 'DESC'}" 
        #print(f"Sample query = {sample_query}")
        #print(f"\nQuery string = {query_string}")

#        self.sqlDetector.detectInjection(sample_query, query_string)

        page = self._run_timestream_query(query_string, request.next_token, request.max_rows)
        #print(f"\nRaw result = {page}")

        return self._convert_timestream_query_page_to_udq_response(page, request.entity_id, request.component_name)


    # overrides MultiEntityReader.component_type_query abstractmethod
    def component_type_query(self, request: IoTTwinMakerUDQComponentTypeRequest) -> IoTTwinMakerUdqResponse:
        """
        This is a componentTypeId query.
        The componentTypeId is resolved into the (partial) externalIds for this component type so we are getting a vehicleName passed in.
        We are selecting all entries matching the passed in vehicleName and additional filters
        """
        LOGGER.info("TimestreamReader component_type_query")

        requestd = vars(request)
        print("\nRequest = ")
        print(requestd)
        #mrows = requestd.max_rows
        #print("mrows= ", mrows)
        selected_properties = request.selected_properties
        print(f"\nSelected properties = {selected_properties}")
        print(f"mres = {request.max_rows}")

 
        vehicle_name = request.udq_context['properties']['vehicleName']['value']['stringValue']
        print(f"Vehicle name = {vehicle_name}")

        property_filter = request.property_filters[0] if request.property_filters else None
        filter_clause = f"AND measure_value::varchar {property_filter['operator']} '{property_filter['value']['stringValue']}'" if property_filter else ""

        sample_sel_properties = [f"p{x}" for x in range(0, len(selected_properties))] # e.g. "p0", "p1", ...
        sample_measure_name_clause = " OR ".join([f"measure_name = '{x}'" for x in sample_sel_properties])
        measure_name_clause = " OR ".join([f"measure_name = '{x}'" for x in selected_properties])
        print(f"Measure name clause {measure_name_clause} sample sel prop = {sample_sel_properties} sample measure_name_clause = {sample_measure_name_clause}")
        if property_filter:
            sample_query = f"""SELECT vehicleName, measure_name, time, measure_value::double FROM {self.database_name}.{self.table_name} WHERE time > from_iso8601_timestamp('{request.start_time}') AND vehicleName = {vehicle_name} AND {measure_name_clause} ORDER BY time ASC"""
        else:
            sample_query = f"""SELECT vehicleName, measure_name, time, measure_value::double FROM {self.database_name}.{self.table_name} WHERE time > from_iso8601_timestamp('{request.start_time}') AND vehicleName = {vehicle_name} AND {measure_name_clause} ORDER BY time ASC"""

        query_string = f"SELECT vehicleName, measure_name, time, measure_value::double" \
                       f""" FROM {self.database_name}.{self.table_name}""" \
                       f""" WHERE time > from_iso8601_timestamp('{request.start_time}')""" \
                       f""" AND vehicleName = '{vehicle_name}'""" \
                       f""" AND {measure_name_clause}""" \
                       f""" ORDER BY time {'ASC' if request.order_by == OrderBy.ASCENDING else 'DESC'}""" 
                       
                       
        print(f"Sample query = {sample_query} \n Query string = {query_string}")

        self.sqlDetector.detectInjection(sample_query, query_string)

        page = self._run_timestream_query(query_string, request.next_token, request.max_rows)
        #print(f"Raw result = {page}")
        return self._convert_timestream_query_page_to_udq_response(page, request.entity_id, request.component_name)

    def _run_timestream_query(self, query_string, next_token, max_rows) -> dict:
        """
        Utility function: handles executing the given query_string on AWS Timestream. Returns an AWS Timestream Query Page
        see https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/timestream-query.html#TimestreamQuery.Client.query
        """
        LOGGER.info("Query string is %s , next token is %s", query_string, next_token)
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

            return page

        except Exception as err:
            LOGGER.error("Exception while running query: %s", err)
            raise err

    @staticmethod
    def _convert_timestream_query_page_to_udq_response(query_page, entity_id, component_name):
        """
        Utility function: handles converting an AWS Timestream Query Page into a IoTTwinMakerUdqResponse object
        For each IoTTwinMakerDataRow, we include:
        - the raw row data from Timestream
        - the column schema from Timestream we can later use to interpret the row
        - and the entity_id, component_name as context for constructing the entityPropertyReference
        """
        #LOGGER.info("Query result is %s", query_page)
        result_rows = []
        schema = query_page['ColumnInfo']
        for row in query_page['Rows']:
            result_rows.append(TimestreamDataRow(row, schema, entity_id, component_name))
        return IoTTwinMakerUdqResponse(result_rows, query_page.get('NextToken'))


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


# Main Lambda invocation entry point, use the TimestreamReader to process events
# noinspection PyUnusedLocal
def data_reader_handler(event, context):
    #LOGGER.info('Event: %s', event)
    result = TIMESTREAM_UDQ_READER.process_query(event)
    #LOGGER.info("result:")
    #LOGGER.info(result)
    return result


