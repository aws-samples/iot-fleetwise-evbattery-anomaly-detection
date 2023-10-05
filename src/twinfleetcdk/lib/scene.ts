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
            "environmentPreset": "neutral"
        },
        "nodes": [],
        "rootNodeIndexes": [0],
        "cameras": [],
        "rules": {
            "DTCShaderRule": {
                "statements": [{
                    "expression": "hasActiveDTC == 0.0",
                    "target": "iottwinmaker.common.color:#0144f9"
                }, {
                    "expression": "hasActiveDTC == 1.0",
                    "target": "iottwinmaker.common.color:#d13212"
                }]
            }
        }
    };
    //
    //
    constructor(max_vehicles: number, bucket_uri: string) {

        // create parent node 
        this.add_to_scene("FleetEV", "FLEET", "FleetEV", 0, max_vehicles, bucket_uri);

        // add child nodes
        for (let index = 1; index < max_vehicles + 1; index++) {
            let vehicle_name = `Vehicle${index}`;
            this.add_to_scene(vehicle_name, "CAR", vehicle_name, index, max_vehicles, bucket_uri);
            // console.log(`Added ${vehicle_name} to scene`);
        }
    }

    //
    // derive the position of the entity based on its index
    //
    get_entity_position(index: number): number[] {
        const ITEMS_PER_ROW = 10;
        const ZSPACING = -10; // spacing between vehicle rows
        const XSPACING = 15; // spacing between vehicles

        let veh_num = index - 1; // adjust because first vehicle has index 1
        let zposn = (veh_num % ITEMS_PER_ROW) * ZSPACING;
        let xposn = Math.floor(veh_num / ITEMS_PER_ROW) * XSPACING;
        let yposn = 0;

        let position = [ xposn, yposn, zposn ];
        return position;
    }


    //
    // add_to_scene - adds the node entry for the entity specified to the scene
    //
    add_to_scene(entityName: string, entityType : string, entity_ID: string, entityIndex: number, 
        maxVehicles: number, bucketUri: string) {

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
            let posn = this.get_entity_position(entityIndex);
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
            const cname = "com.user.evtwindata"
            const propname = "HasActiveDTC"
            let epath = `FleetEV/${entity_ID}`  
            //const rulename = "DTCShaderRule"

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

