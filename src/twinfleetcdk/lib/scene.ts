// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 2023
// SPDX-License-Identifier: Apache-2.0

//
// Scene - creates a representation of the overall scene hierarchy, rules, etc.
//
export class SceneModel {

    public scene_model: any = {
        "specVersion": "1.0",
        "version": "1",
        "unit": "meters",
        "properties": {
            "environmentPreset": "neutral",
            "dataBindingConfig": {
              "fieldMapping": {
                "entityId": [
                  "sel_entity"
                ],
                "componentName": [
                  "sel_comp"
                ]
              },
              "template": {
                "sel_entity": "vin100",
                "sel_comp": "EVDataComp"
              }
            }
        },
        "nodes": [],
        "rootNodeIndexes": [0],
        "cameras": [],
        "rules": {
            "DTCShaderRule": {
                "statements": [{
                    "expression": "HASActiveDTC == 0.0",
                    "target": "iottwinmaker.common.color:#90939a"
                }, {
                    "expression": "HASActiveDTC == 1.0",
                    "target": "iottwinmaker.common.color:#d13212"
                }]
            },
            "TagIconRule": {
              "statements": [
                {
                  "expression": "HASActiveDTC > 0",
                  "target": "iottwinmaker.common.icon:Error"
                },
                {
                  "expression": "HASActiveDTC == 0",
                  "target": "iottwinmaker.common.icon:Info"
                }
              ]
            },
        }
    };
    //
    //
    constructor(max_vehicles: number, vehicle_base_number: number, bucket_uri: string) {

        // create parent node 
        this.add_to_scene("FleetEV", "FLEET", "FleetEV", 0, max_vehicles, bucket_uri, vehicle_base_number);

        for (let index = vehicle_base_number; index < max_vehicles + vehicle_base_number; index++) {
            let vehicle_name = `vin${index}`;

            this.add_to_scene(vehicle_name, "CAR", vehicle_name, index, max_vehicles, bucket_uri, vehicle_base_number);
        }
    }

    //
    // derive the position of the entity based on its index
    //
    get_entity_position(index: number, base_num: number): number[] {
        const ITEMS_PER_ROW = 10;
        const ROW_SPACING = -10; // spacing between vehicle rows
        const CAR_SPACING = 15; // spacing between vehicles

        let veh_num = index - base_num; // adjust to zero base
        let zposn = (veh_num % ITEMS_PER_ROW) * ROW_SPACING;
        let yposn = 0;
        let xposn = Math.floor(veh_num / ITEMS_PER_ROW) * CAR_SPACING;

        let position = [ xposn, yposn, zposn ];
        return position;
    }


    //
    // add_to_scene - adds the node entry for the entity specified to the scene
    //
    add_to_scene(entityName: string, entityType : string, entity_ID: string, entityIndex: number, 
        maxVehicles: number, bucketUri: string, indexBase: number) {

        interface entity {
            name: string,
            transform: {
                position: number[],
                rotation: number[],
                scale: number[]
            },
            transformConstraint: {},
            children: number[],
            components: any[],
            properties: {}
        }
        if (entityType == "CAR") {
            let posn = this.get_entity_position(entityIndex, indexBase);
            let car_entity: entity = {
                name: entityName,
                transform: {
                    position: posn,
                    rotation: [ 0, 0, 0 ],
                    scale: [ 1, 1, 1 ]
                },
                transformConstraint: {},
                children: [],
                components: [],
                properties: {}
            }
       
            const carmodelref = {
                "type": "ModelRef",
                "uri": `${bucketUri}/vehicle.glb`,
                "modelType": "GLB",
                "unitOfMeasure": "meters",
                "castShadow": false,
                "receiveShadow": false,
            }
            car_entity.components.push(carmodelref);
    
            // add model shader
            const cname = "EVDataComp";
            const propname = "HASActiveDTC";
            let epath = `FleetEV/${entity_ID}`; 

            const carmodelshader = {
                type: "ModelShader",
                valueDataBinding: {
                    dataBindingContext: {
                        entityId: entity_ID,
                        componentName: cname,
                        propertyName: propname,
                        entityPath: epath,
                    }, 
                },
                ruleBasedMapId : "DTCShaderRule"
            }

            car_entity.components.push(carmodelshader);

            // add tag icon rule
            const tagiconrule = {
                type: "Tag",
                icon: "iottwinmaker.common.icon:Info",
                valueDataBinding: {
                  dataBindingContext: {
                    entityId: "vin100",
                    componentName: "EVDataComp",
                    propertyName: "Vehicle.Powertrain.BMSMainRelay"
                  },
                  isStaticData: false
                },
                ruleBasedMapId: "TagIconRule"
            }
            car_entity.components.push(tagiconrule);


            // add the entity to the scene
            this.scene_model["nodes"].push(car_entity);
        } else {
            if (entityType == "FLEET") {
                let children = [];
                for (let index = 1; index < maxVehicles + 1; index++) {
                    children.push(index);
                }
    
                let fleet_entity = {
                    "name": entityName,
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
                this.scene_model["nodes"].push(fleet_entity);
            }  
        }
    }
}

