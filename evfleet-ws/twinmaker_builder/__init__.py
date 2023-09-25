# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 2022
# SPDX-License-Identifier: Apache-2.0

from typing import Mapping
from aws_cdk import aws_iottwinmaker as twinmaker

from os import path
import sys
import inspect
import yaml
from constructs import Construct
import json
import re
import logging

##from ngsildclient.utils.urn import Urn

from .oldscene import SceneNode, JSONEncoder

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)


class TwinMakerObject:
    #
    # Defines the base API of an object in the domain model. A basic object has properties like id, name and model
    # and can contain other TwinMakerObjects that are then managed in a parent-child relationship.
    #xxxx A TwinMakerObject has a unique URN to identify itself that by default follows the ngsi-ld specification.
    #

    def __init__(self, description: dict, parent=None, fields=None) -> None:
        self.items = []
        self.parent = parent

        self.model = description["model"] if "model" in description else None
        self._name = description["name"] if "name" in description else None
        self._id = description["id"] if "id" in description else None

        if fields:
            self._read_props(description, fields)

    # 
    # Set up a visit for this class instance
    # Parameters
    #     visitor: A visitor class that must implement the `accept` method.
    #
    # Examples
    #   farm = TwinMakerRoot.load_from_yaml("farm.yaml", EVFleet)
    #   visitor = EVFleetSceneVisitor(
    #       s3_bucket_name="test_bucket", base_file="tests/unit/base.json"
    #   )
    #
    #    farm.visit(visitor)
    #
    def visit(self, visitor):
        visitor.accept(self)

        # recurse into child items
        for item in self.items:
            item.visit(visitor)

    #
    # Internal method that introspects the description field and creates the properties found
    # in the fields array
    #
    def _read_props(self, description: dict, fields):
        for field in fields:
            self.__dict__[field] = description[field] if field in description else None

    # 
    # Returns: The index of this object in the parent else 0
    #
    @property
    def index(self):
        return self.parent.items.index(self) if self.parent else 0

    # 
    # Returns: The index of this object in the parent else 0
    # TODO - remove this
    @property
    def urn(self):
        """Return the URN of the object 

        """
        if self._id:
            final_id = self._id
        else:
            final_id = self.infer_id_from_name()

        #return Urn(nss=f"{type(self).__name__}:{final_id}")
        temp_urn = f"{final_id}"
        return temp_urn

    # 
    # Infer the ID from the name of the object.
    #
    def infer_id_from_name(self):
        return self.name.replace(" ", "")

    # 
    # Name of the object
    #
    @property
    def name(self):
        return self._name


class TwinMakerRoot(TwinMakerObject):
    """Represents the root of a domain model."""

    def __init__(self, description: dict, fields=None) -> None:
        """Internal constructor, use the load_from_yaml method instead."""
        super().__init__(description, fields=fields)
        self._description = description

        self.klasses = {}
        for name, obj in inspect.getmembers(sys.modules[self.__module__]):
            if inspect.isclass(obj):
                self.klasses[name] = obj

        if "items" in description:
            for item in description["items"]:
                try:
                    self.items.append(self._build_item(item, self))
                except Exception as e:
                    LOGGER.info("Unable to build item: " + str(e))
        print(f"self klasses {self.klasses} items= {self.items}")

    def _build_item(self, item_description: dict, parent=None) -> TwinMakerObject:
        """Recursive method to build a TwinMakerObject based on its description"""
        if "type" not in item_description:
            raise Exception("No type defined for item")

        type = item_description["type"]
        item = None

        if type in self.klasses:
            item = self.klasses[type](item_description, parent=parent)
        else:
            print(f"type {type} not in self klasses")

        if item and "items" in item_description:
            for sub_item in item_description["items"]:
                item.items.append(self._build_item(sub_item, parent=item))

        if item:
            return item
        else:
            raise Exception(f"Item type not found : {type}")

    def load_from_yaml(description_file_path: str, class_type):
        # """Loads a Domain model from a YAML file
        #
        # Parameters
        #     description_file_path: string, required
        #         The path to a YAML file describing the model
        #     class_type: type, required
        #         The type of the root class. The module for this root class is used to lookup
        #         all the other classes mentionned in the YAML file.
        # Returns: 
        #     A TwinMakerRoot Object using the class_type mentioned as a parameter
        # Examples
        #     farm = TwinMakerRoot.load_from_yaml("farm.yaml", EVFleet)
        #     assert farm.name == "ACME Farm"
        #
        if not path.exists(description_file_path):
            raise Exception(
                f"Path for site description not found: {description_file_path}"
            )

        with open(description_file_path) as file:
            description = yaml.safe_load(file)
            return class_type(description)


def to_snake_case(name):
    """Convert a name in snake_case

    Parameters
    ----------
        name: string, required
            The name to be converted

    Returns
    -------
        The name in snake_case

    Examples
    --------
        name = to_snake_case(EVFleet)
        assert name == "wind_farm"
    """
    name = re.sub("(.)([A-Z][a-z]+)", r"\1_\2", name)
    name = re.sub("__([A-Z])", r"_\1", name)
    name = re.sub("([a-z0-9])([A-Z])", r"\1_\2", name)
    return name.lower()


class TwinMakerCDKVisitor(Construct):
    """Abstract visitor to generate CDK calls from a domain model. In its accept
    method, it introspect the current class implementation to find some methods
    matching the `on_{object_type}` pattern and calling them.
    The hook must return a CfnEntity object.

    Examples
    --------

        def on_wind_farm(self, farm: EVFleet):
            return twinmaker.CfnEntity(
                self,
                f"EVFleet{farm.name}",
                parent_entity_id=farm.parent.urn.fqn if farm.parent else None,
                entity_name=farm.name,
                entity_id=farm.urn.fqn,
                workspace_id=self._workspace.workspace_id,
                components={},
            )

    """

    def __init__(
        self, scope: "Construct", id: str, workspace: twinmaker.CfnWorkspace
    ) -> None:
        super().__init__(scope, id)

        self._workspace = workspace
        self._index_entities: Mapping[str, twinmaker.CfnEntity] = {}

        self.node.add_dependency(workspace)

    # 
    # Accept visitors
    #
    def accept(self, entity: TwinMakerObject):

        # Convert the object type to snake_case, verify if there is
        # a hook for that type and call it if found
        class_type = type(entity).__name__
        method_name = f"on_{to_snake_case(class_type)}"
        method = getattr(self, method_name, None)
        if callable(method):
            twinmaker_entity = method(entity)

            # Index entities by their entity_id to be able to reference them when
            # creating the dependency
            self._index_entities[twinmaker_entity.entity_id] = twinmaker_entity
            print(f" index  entities = {method_name} {twinmaker_entity.entity_id} {twinmaker_entity.parent_entity_id}")

            # TODO If entity has a parent, add the dependency
            #if twinmaker_entity.parent_entity_id:
                #parent = self._index_entities[twinmaker_entity.parent_entity_id]
                #twinmaker_entity.node.add_dependency(parent)


class SceneVisitor:
    #
    # Abstract visitor to generate a TwinMaker 3D scene from a domain model. In its accept
    # method, it introspects the current class implementation to find some methods
    # matching the `on_{object_type}` pattern and calls them. The hook is passed the
    # current entity and the SceneNode associated with it.
    #
    # Examples
    #
    #   def on_turbine(self, turbine: Turbine, node: SceneNode):
    #
    #       node.transform.position.z = turbine.index * 10
    #
    #       # Hard coding the 3D model used
    #       node.components.append(
    #           {
    #               "type": "ModelRef",
    #               "uri": f"s3://{self.s3_bucket_name}/models/animated_wind_turbine.glb",
    #               "modelType": "GLB"
    #           }
    #       )
    #
    #

    def __init__(self, s3_bucket_name, base_file: str = "base.json") -> None:

        self.s3_bucket_name = s3_bucket_name

        # Initialize content JSON
        with open(base_file) as file:
            self.content = json.load(file)

        # entity_id to entity
        self.entity_index = {}

    def _add_node(self, node: SceneNode):
        self.content["nodes"].append(node)

    #
    # Accept visitors
    #
    def accept(self, entity: TwinMakerObject):
        node = SceneNode(self, entity.name, model=entity.model)
        #self.entity_index[entity.urn.fqn] = (entity, node)
        self.entity_index[entity.urn] = (entity, node)
        self._add_node(node)

        class_type = type(entity).__name__
        method_name = f"on_{to_snake_case(class_type)}"
        method = getattr(self, method_name, None)
        if callable(method):
            method(entity, node)

        # To handle hierarchy of nodes
        entity_index = self.content["nodes"].index(node)
        if entity.parent:
            #parent_node = self.entity_index[entity.parent.urn.fqn][1]
            parent_node = self.entity_index[entity.parent.urn][1]
            parent_node.children.append(entity_index)
            print(len(parent_node.children))
        else:
            self.content["rootNodeIndexes"].append(entity_index)

    # 
    # Returns
    #   A JSON string representing the scene in 3D.
    #
    def get_content(self):
        return JSONEncoder().encode(self.content)

    # 
    # Return the path of of an entity in the hierarchy
    # 
    def get_entity_path(self, entity: TwinMakerObject) -> str:
        if entity.parent:
            return self.get_entity_path(entity.parent) + "/" + entity.name
        else:
            return entity.name
