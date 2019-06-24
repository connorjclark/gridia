import * as Content from './content';
import WorldMap from "./world-map";
import mapgen from "./mapgen";

export default function createDebugWorldMap() {
  const worldMap = new WorldMap();

  const defaultPartition = mapgen(100, 100, 2, false);
  defaultPartition.getTile({x: 7, y: 5, z: 0}).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: {w: 1, x: 5, y: 5, z: 0},
  };
  worldMap.addPartition(0, defaultPartition);

  const smallPartition = mapgen(20, 20, 1, true);
  smallPartition.getTile({x: 7, y: 5, z: 0}).item = {
    type: Content.getMetaItemByName('Warp Portal').id,
    quantity: 1,
    warpTo: {w: 0, x: 9, y: 12, z: 0},
  };
  worldMap.addPartition(1, smallPartition);

  return worldMap;
}
