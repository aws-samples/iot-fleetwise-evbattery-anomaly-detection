# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 2022
# SPDX-License-Identifier: Apache-2.0

import json


#
# Scene - creates a representation of the overall scene hierarchy, rules, etc.
#
class Scene:

    def __init__(self, max_vehicles):

        self.VEHICLES_IN_FLEET = max_vehicles

        # create parent node 

        self.scene_base = {
            "specVersion": "1.0",
            "version": "1",
            "unit": "meters",
            "properties": {
                "environmentPreset": "neutral"
            },
            "nodes": [],
            "rootNodeIndexes": [0],
            "cameras": [],
            "rules": {
                "DTCColorRule": {
                    "statements": [{
                        "expression": "hasActiveDTC == 0.0",
                        "target": "iottwinmaker.common.color:#0144f9"
                    }, {
                        "expression": "hasActiveDTC == 1.0",
                        "target": "iottwinmaker.common.color:#d13212"
                    }]
                }
            }
        } 
        # add the parent node
        self.add_to_scene(None, "fleetEV", "FLEET", "fleetEV", 0, None)

        # add child nodes
        carmodelref = {
                "type": "ModelRef",
                "uri": f"s3://evtwin2-evfleet-192773328237-us-east-1/models/vehicle.glb",
                "modelType": "GLB",
                "unitOfMeasure": "meters",
                "castShadow": False,
                "receiveShadow": False,
        }
        for index in range(1, self.VEHICLES_IN_FLEET + 1):
            vehicle_name = f"Vehicle{index}"
            self.add_to_scene("fleetEV", vehicle_name, "CAR", vehicle_name, index, carmodelref)


    #
    # derive the position of the entity based on its index
    #
    def get_entity_position(self, index):
        ITEMS_PER_ROW = 10
        ZSPACING = -10 # spacing between vehicle rows
        XSPACING = 15 # spacing between vehicles

        index = index - 1 # adjust because first vehicle has index 1
        zposn = (index % ITEMS_PER_ROW) * ZSPACING
        xposn = (index // ITEMS_PER_ROW) * XSPACING
        yposn = 0

        position = [ xposn, yposn, zposn ]
        return position


    #
    # add_to_scene - adds the node entry for the entity specified to the scene
    #
    def add_to_scene(self, parent, name: str, entityType : str, entityID, entityIndex, model=None): 


        if entityType == "CAR":
            posn = self.get_entity_position(entityIndex)
            entity = {
                "name": name,
                "transform": {
                    "position": posn,
                    "rotation": [ 0, 0, 0 ],
                    "scale": [ 1, 1, 1 ]
                },
                "transformConstraint": {},
                "children": [],
                "components": [],
                "properties": {}
            }
       

            # 3D model reference
            if model:
                if "uri" in model:
                    uri = model["uri"]

            entity["components"].append( {
                    "type": "ModelRef",
                    "uri": f"{uri}",
                    "modelType": "GLB",
                    "unitOfMeasure": "meters",
                    "castShadow": False,
                    "receiveShadow": False,
                }
            )
    
            # add model shader
            cname = "com.user.evtwindata"
            propname = "HasActiveDTC"
            epath = f"fleetEV/{entityID}"  # TODO make generic
            rulename = "DTCColorRule"

            ms = self.create_model_shader(entityID, cname, propname, epath, "", rulename)
            entity["components"].append(ms)
            self.scene_base["nodes"].append(entity)


        if entityType == "FLEET":
            children = []
            for index in range(1, self.VEHICLES_IN_FLEET + 1):
                children.append(index)

            entity = {
                "name": name,
                "transform": {
                    "position": [ 0, 0, 0 ],
                    "rotation": [ 0, 0, 0 ],
                    "scale": [ 1, 1, 1 ]
                },
                "transformConstraint": {},
                "children": children,
                "components": [],
                "properties": {}
            }
            self.scene_base["nodes"].append(entity)

    #
    # creates a dictionary representation of the model shader
    #
    def create_model_shader(
            self,
            entity_id: str,
            component_name: str,
            property_name: str,
            entity_path: str,
            data_frame_label: str,
            rule: str,
        ):
        
        shader = {}
        shader["type"] = "ModelShader"
        shader["valueDataBinding"] = {
            "dataBindingContext": {
                "entityId": entity_id,
                "componentName": component_name,
                "propertyName": property_name,
                "entityPath": entity_path,
            },
            "dataFrameLabel": data_frame_label,
        }

        shader["ruleBasedMapId"] = rule
        return shader


