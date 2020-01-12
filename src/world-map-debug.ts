import * as Content from './content';
import mapgen from './mapgen';
import WorldMap from './world-map';

export default function createDebugWorldMap() {
  // TODO: standardize naming for map, world map, parititon, etc.
  const world = new WorldMap();

  const defaultMap = mapgen(200, 200, 2, false);
  defaultMap.partition.getTile({x: 7, y: 5, z: 0}).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: {w: 1, x: 5, y: 5, z: 0},
  };
  world.addPartition(0, defaultMap.partition);

  const smallMap = mapgen(20, 20, 1, true);
  smallMap.partition.getTile({x: 7, y: 5, z: 0}).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: {w: 0, x: 9, y: 12, z: 0},
  };
  world.addPartition(1, smallMap.partition);

  return {
    world,
    maps: [defaultMap, smallMap],
  };
}
