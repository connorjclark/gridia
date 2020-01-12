import * as Content from './content';
import mapgen from './mapgen';
import WorldMap from './world-map';

export default function createDebugWorldMap() {
  // TODO: standardize naming for map, world map, parititon, etc.
  const world = new WorldMap();
  const width = 200;
  const height = 200;

  const defaultMap = mapgen(width, height, 2, false);
  world.addPartition(0, defaultMap.partition);

  const smallMap = mapgen(20, 20, 1, true);
  world.addPartition(1, smallMap.partition);

  // middle defaultMap <-> topleft defaultMap
  defaultMap.partition.getTile({x: Math.floor(width / 2), y: Math.floor(height / 2), z: 0}).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: {w: 0, x: 1, y: 1, z: 0},
  };
  defaultMap.partition.getTile({x: 1, y: 1, z: 0}).item = undefined;
  defaultMap.partition.getTile({x: 0, y: 0, z: 0}).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: {w: 0, x: Math.floor(width / 2), y: Math.floor(height / 2) - 1, z: 0},
  };

  // defaultMap <-> smallMap
  defaultMap.partition.getTile({x: 7, y: 5, z: 0}).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: {w: 1, x: 5, y: 5, z: 0},
  };
  smallMap.partition.getTile({x: 7, y: 5, z: 0}).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: {w: 0, x: 9, y: 12, z: 0},
  };

  return {
    world,
    maps: [defaultMap, smallMap],
  };
}
