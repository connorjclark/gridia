import { Connection } from './client/connection';
import { SECTOR_SIZE } from './constants';
import * as CommandBuilder from './protocol/command-builder';
import WorldMapPartition from './world-map-partition';

export default class WorldMap {
  partitions = new Map<number, WorldMapPartition>();
  loader?: (sectorPoint: TilePoint) => Promise<Sector>;

  addPartition(w: number, partition: WorldMapPartition) {
    this.partitions.set(w, partition);
    partition.loader = (sectorPoint: PartitionPoint) => {
      if (!this.loader) throw new Error('loader not set');
      return this.loader({ w, ...sectorPoint });
    };
  }

  initPartition(w: number, width: number, height: number, depth: number) {
    const partition = new WorldMapPartition(width, height, depth);
    // TODO: refactor sector requesting / loading.
    this.addPartition(w, partition);
  }

  getPartition(w: number) {
    const partition = this.partitions.get(w);
    // Currently, all partitions are always loaded, so the following error should
    // never happen.
    if (!partition) throw new Error(`unknown partition for: ${w}`);
    return partition;
  }

  getPartitions() {
    return this.partitions;
  }

  inBounds(point: TilePoint): boolean {
    return this.getPartition(point.w).inBounds(point);
  }

  walkable(point: TilePoint): boolean {
    return this.getPartition(point.w).walkable(point);
  }

  walkableAsync(point: TilePoint): Promise<boolean> {
    return this.getPartition(point.w).walkableAsync(point);
  }

  getSector(sectorPoint: TilePoint): Sector {
    return this.getPartition(sectorPoint.w).getSector(sectorPoint);
  }

  getTile(point: TilePoint): Tile {
    return this.getPartition(point.w).getTile(point);
  }

  setTile(point: TilePoint, tile: Tile) {
    return this.getPartition(point.w).setTile(point, tile);
  }

  getItem(point: TilePoint) {
    return this.getPartition(point.w).getItem(point);
  }

  createEmptySector() {
    const tiles: Tile[][] = [];

    for (let x = 0; x < SECTOR_SIZE; x++) {
      tiles[x] = [];
      for (let y = 0; y < SECTOR_SIZE; y++) {
        tiles[x][y] = {
          floor: 0,
        };
      }
    }

    return tiles;
  }

  forEach(center: TilePoint, radius: number, fn: (loc: TilePoint, tile: Tile) => void) {
    const startX = Math.max(0, center.x - radius);
    const startY = Math.max(0, center.y - radius);
    const endX = Math.min(this.getPartition(center.w).width, center.x + radius);
    const endY = Math.min(this.getPartition(center.w).height, center.y + radius);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const loc = { ...center, x, y };
        fn(loc, this.getTile(loc));
      }
    }
  }
}

export function createClientWorldMap(connection: Connection) {
  const map = new WorldMap();
  map.loader = (sectorPoint) => {
    connection.sendCommand(CommandBuilder.requestSector(sectorPoint));
    return Promise.resolve(map.createEmptySector()); // temporary until server sends something
  };
  return map;
}
