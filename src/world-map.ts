import { Connection } from './client/connection';
import { SECTOR_SIZE } from './constants';
import * as ProtocolBuilder from './protocol/client-to-server-protocol-builder';
import WorldMapPartition from './world-map-partition';

export default class WorldMap {
  public partitions = new Map<number, WorldMapPartition>();
  public loader: (sectorPoint: TilePoint) => Promise<Sector>;

  public addPartition(w: number, partition: WorldMapPartition) {
    this.partitions.set(w, partition);
  }

  public initPartition(w: number, width: number, height: number, depth: number) {
    const partition = new WorldMapPartition(width, height, depth);
    // TODO: refactor sector requesting / loading.
    partition.loader = (sectorPoint: PartitionPoint) => {
      return this.loader({w, ...sectorPoint});
    };
    this.partitions.set(w, partition);
  }

  public getPartition(w: number) {
    return this.partitions.get(w);
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
