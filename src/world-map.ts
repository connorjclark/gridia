import { Connection } from './client/connection';
import { SECTOR_SIZE } from './constants';
import * as ProtocolBuilder from './protocol/client-to-server-protocol-builder';
import WorldMapPartition from './world-map-partition';

export default class WorldMap {
  public partitions = new Map<number, WorldMapPartition>();
  public loader?: (sectorPoint: TilePoint) => Promise<Sector>;

  public addPartition(w: number, partition: WorldMapPartition) {
    this.partitions.set(w, partition);
    partition.loader = (sectorPoint: PartitionPoint) => {
      if (!this.loader) throw new Error('loader not set');
      return this.loader({w, ...sectorPoint});
    };
  }

  public initPartition(w: number, width: number, height: number, depth: number) {
    const partition = new WorldMapPartition(width, height, depth);
    // TODO: refactor sector requesting / loading.
    this.addPartition(w, partition);
  }

  public getPartition(w: number) {
    const partition = this.partitions.get(w);
    // Currently, all partitions are always loaded, so the following error should
    // never happen.
    if (!partition) throw new Error(`unknown partition for: ${w}`);
    return partition;
  }

  public getPartitions() {
    return this.partitions;
  }

  public inBounds(point: TilePoint): boolean {
    return this.getPartition(point.w).inBounds(point);
  }

  public walkable(point: TilePoint): boolean {
    return this.getPartition(point.w).walkable(point);
  }

  public walkableAsync(point: TilePoint): Promise<boolean> {
    return this.getPartition(point.w).walkableAsync(point);
  }

  public getSector(sectorPoint: TilePoint): Sector {
    return this.getPartition(sectorPoint.w).getSector(sectorPoint);
  }

  public getTile(point: TilePoint): Tile {
    return this.getPartition(point.w).getTile(point);
  }

  public setTile(point: TilePoint, tile: Tile) {
    return this.getPartition(point.w).setTile(point, tile);
  }

  public getItem(point: TilePoint) {
    return this.getPartition(point.w).getItem(point);
  }

  public createEmptySector() {
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
}

export function createClientWorldMap(connection: Connection) {
  const map = new WorldMap();
  map.loader = async (sectorPoint) => {
    connection.send(ProtocolBuilder.requestSector(sectorPoint));
    return map.createEmptySector(); // temporary until server sends something
  };
  return map;
}
