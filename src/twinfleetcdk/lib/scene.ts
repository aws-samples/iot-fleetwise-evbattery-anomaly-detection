// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 2023
// SPDX-License-Identifier: Apache-2.0

//
// Scene - creates a representation of the overall scene hierarchy, rules, etc.
//
export class SceneModel {

  public scene_model: any = {
    specVersion: '1.0',
    version: '1',
    unit: 'meters',
    properties: {
      environmentPreset: 'neutral',
      dataBindingConfig: {
        fieldMapping: {
          entityId: [
            'sel_entity',
          ],
          componentName: [
            'sel_comp',
          ],
        },
        template: {
          sel_entity: '${sel_entity}',
          sel_comp: 'EVDataComp',
          sel_prop: 'Vehicle_Powertrain_Battery_hasActiveDTC',
        },
      },
    },
    nodes: [],
    rootNodeIndexes: [],
    cameras: [],
    rules: {
      DTCShaderRule: {
        statements: [{
          expression: 'Vehicle_Powertrain_Battery_hasActiveDTC == 0',
          target: 'iottwinmaker.common.color:#90939a',
        }, {
          expression: 'Vehicle_Powertrain_Battery_hasActiveDTC == 1',
          target: 'iottwinmaker.common.color:#d13212',
        }],
      },
      TagIconRule: {
        statements: [
          {
            expression: 'Vehicle_Powertrain_Battery_hasActiveDTC == 1',
            target: 'iottwinmaker.common.icon:Error',
          },
          {
            expression: 'Vehicle_Powertrain_Battery_hasActiveDTC == 0',
            target: 'iottwinmaker.common.icon:Info',
          },
        ],
      },
    },
  };
    //
    //
  constructor(view_type: string, max_vehicles: number, vehicle_base_number: number, bucket_uri: string) {

    let next_node = 0; // scene node number

    if (view_type == 'FLEETVIEW') {
      // create parent node
      next_node = this.add_to_scene(next_node, 'FleetEV', 'FLEET', 'FleetEV', 0,
        bucket_uri, vehicle_base_number);
    }
    // add vehicles
    for (let index = vehicle_base_number; index < max_vehicles + vehicle_base_number; index++) {
      let vehicle_name = `vin${index}`;

      if (view_type == 'FLEETVIEW') {
        next_node = this.add_to_scene(next_node, vehicle_name, 'CAR', vehicle_name, index,
          bucket_uri, vehicle_base_number);
      } else {
        // assume inspection view
        next_node = this.add_to_scene(next_node, 'sel_entity', 'CAR', '${sel_entity}', index,
          bucket_uri, vehicle_base_number);
      }
    }
  }

  //
  // derive the position of the entity based on its index
  // Returns: entity position and tag position
  //
  get_entity_position(index: number, base_num: number): [number[], number[]] {
    const ITEMS_PER_ROW = 5;
    const ROW_SPACING = -10; // spacing between vehicle rows
    const CAR_SPACING = -15; // spacing between vehicles

    const veh_num = index - base_num; // adjust to zero base
    const xposn = (veh_num % ITEMS_PER_ROW) * CAR_SPACING;
    const yposn = 0;
    const zposn = Math.floor(veh_num / ITEMS_PER_ROW) * ROW_SPACING;

    const entity_position = [xposn, yposn, zposn];

    // derive tag position relative to car
    const tag_position = [xposn + 0.0, yposn + 0.5, zposn + 0.0];

    return [entity_position, tag_position];
  }


  //
  // add_to_scene - adds the node entry for the entity specified to the scene
  // Returns the next node that can be used.
  //
  add_to_scene(nextNode: number, entityName: string, entityType : string, entity_ID: string, entityIndex: number,
    bucketUri: string, indexBase: number): number {

    interface entity {
      name: string;
      transform: {
        position: number[];
        rotation: number[];
        scale: number[];
      };
      transformConstraint: {};
      children: number[];
      components: any[];
      properties: {};
    }

    let node_num = nextNode;
    let child_nodes: number[] = [];

    if (entityType == 'CAR') {
      const [posn, tagposn] = this.get_entity_position(entityIndex, indexBase);

      let car_entity: entity = {
        name: entityName,
        transform: {
          position: posn,
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        transformConstraint: {},
        children: [],
        components: [],
        properties: {},
      };

      const carmodelref = {
        type: 'ModelRef',
        uri: `${bucketUri}/truck.glb`,
        modelType: 'GLB',
        unitOfMeasure: 'meters',
        castShadow: false,
        receiveShadow: false,
      };
      car_entity.components.push(carmodelref);

      const cname = 'EVDataComp';
      const propname = 'Vehicle_Powertrain_Battery_hasActiveDTC';
      const epath = `FleetEV/${entity_ID}`;

      // add model shader
      const carmodelshader = {
        type: 'ModelShader',
        valueDataBinding: {
          dataBindingContext: {
            entityId: entity_ID,
            componentName: cname,
            propertyName: propname,
            entityPath: epath,
          },
        },
        ruleBasedMapId: 'DTCShaderRule',
      };

      car_entity.components.push(carmodelshader);

      /**
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
**/


      // add the entity node to the scene
      this.scene_model.nodes.push(car_entity);
      this.scene_model.rootNodeIndexes.push(node_num);
      this.scene_model.nodes[0].children.push(node_num); // add child to parent
      node_num++;

      // add tag node to the scene
      const car_tag = {
        name: 'Tag-' + entity_ID.toString(),
        transform: {
          position: tagposn,
          rotation: [0, 0, 0],
          scale: [3, 3, 3],
        },
        transformConstraint: {},
        components: [{
          type: 'Tag',
          icon: 'iottwinmaker.common.icon:Info',
          ruleBasedMapId: 'TagIconRule',
          valueDataBinding: {
            dataBindingContext: {
              entityId: entity_ID,
              componentName: cname,
              propertyName: propname,
              entityPath: epath,
            },
          },
        }],
        properties: {},
      };
      this.scene_model.nodes.push(car_tag);
      child_nodes.push(node_num); // add as child to entity
      node_num++;

      car_entity.children = child_nodes;

    } else {
      if (entityType == 'FLEET') {
        this.scene_model.rootNodeIndexes.push(node_num);
        //let children = [];
        //for (let index = 1; index < maxVehicles + 1; index++) {
        //children.push(index);
        //}

        let fleet_entity = {
          name: entityName,
          transform: {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          transformConstraint: {},
          children: [],
          components: [],
          properties: {},
        };
        this.scene_model.nodes.push(fleet_entity);
        node_num++;
      }
    }
    return (node_num);
  }
}

