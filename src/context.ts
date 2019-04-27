import {SECTOR_SIZE} from './constants';
import { getMetaItem } from './items';
import { matrix, worldToSector } from './utils';

export abstract class WorldContext {
  public width: number;
  public height: number;
  public depth: number;
  public sectors: Sector[][][];
  public creatures: Record<number, Creature> = {};
  public containers: Map<number, Container> = new Map();

  constructor(width: number, height: number, depth: number) {
    this.init(width, height, depth);
  }

  public init(width: number, height: number, depth: number) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.sectors = matrix(width / SECTOR_SIZE, height / SECTOR_SIZE, depth);
  }

  public abstract load(point: TilePoint): Sector;

  public inBounds(point: TilePoint): boolean {
    return point.x >= 0 && point.y >= 0 && point.x < this.width && point.y < this.height && point.z >= 0 && point.z < this.depth;
  }

  public walkable(point: TilePoint): boolean {
    const tile = this.getTile(point);
    return !tile.creature && (!tile.item || getMetaItem(tile.item.type).walkable);
  }

  public getSector(sectorPoint: TilePoint): Sector {
    let sector = this.sectors[sectorPoint.x][sectorPoint.y][sectorPoint.z];
    if (!sector) {
      sector = this.sectors[sectorPoint.x][sectorPoint.y][sectorPoint.z] = this.load(sectorPoint);
    }
    return sector;
  }

  public getTile(point: TilePoint): Tile | null {
    if (!this.inBounds(point)) return { floor: 0, item: null };

    const sector = this.getSector(worldToSector(point, SECTOR_SIZE));
    return sector[point.x % SECTOR_SIZE][point.y % SECTOR_SIZE];
  }

  public setTile(point: TilePoint, tile: Tile) {
    const sector = this.getSector(worldToSector(point, SECTOR_SIZE));
    sector[point.x % SECTOR_SIZE][point.y % SECTOR_SIZE] = tile;
  }

  public getItem(point: TilePoint) {
    return this.getTile(point).item;
  }

  public getCreature(id: number): Creature | void {
    return this.creatures[id];
  }

  public setCreature(creature: Creature) {
    this.creatures[creature.id] = creature;
    this.getTile(creature.pos).creature = creature;
  }

  protected createEmptySector() {
    /** @type {Tile[][]} */
    const tiles = [];

    for (let x = 0; x < SECTOR_SIZE; x++) {
      tiles[x] = [];
      for (let y = 0; y < SECTOR_SIZE; y++) {
        tiles[x][y] = {
          floor: 0,
          item: null,
        };
      }
    }

    return tiles;
  }
}

export class ClientWorldContext extends WorldContext {
  constructor(private wire: ClientToServerWire) {
    super(0, 0, 0);
  }

  public isInited() {
    return this.width > 0;
  }

  public load(point: TilePoint): Sector {
    this.wire.send('requestSector', point);
    return this.createEmptySector(); // temporary until server sends something
  }
}
