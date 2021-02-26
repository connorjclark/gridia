import WorldMap from './world-map';
import { SECTOR_SIZE } from './constants';
import * as Utils from './utils';
import * as Content from './content';

interface TileSeenLogData {
  floor: number;
  walkable: boolean;
}

export class SectorTileSeenLogData {
  tiles: Array2D<TileSeenLogData | null> = [];

  constructor() {
    for (let x = 0; x < SECTOR_SIZE; x++) {
      this.tiles[x] = [];
      for (let y = 0; y < SECTOR_SIZE; y++) {
        this.tiles[x][y] = null;
      }
    }
  }
}

export class TilesSeenLog {
  // w,x,y,z partition -> data
  seen = new Map<string, SectorTileSeenLogData>();

  getSectorData(point: TilePoint) {
    const sectorPoint = Utils.worldToSector(point, SECTOR_SIZE);
    const key = `${point.w},${sectorPoint.x},${sectorPoint.y},${sectorPoint.z}`;
    let sector = this.seen.get(key);
    if (!sector) {
      sector = new SectorTileSeenLogData();
      this.seen.set(key, sector);
    }

    return sector;
  }

  markSeen(map: WorldMap, point: TilePoint) {
    if (!map.inBounds(point)) return;

    const sector = this.getSectorData(point);
    const tile = map.getTile(point);
    const data = {
      floor: tile.floor,
      walkable: !tile.item || Content.getMetaItem(tile.item.type).walkable,
    };
    sector.tiles[point.x % SECTOR_SIZE][point.y % SECTOR_SIZE] = data;
  }

  getMark(map: WorldMap, point: TilePoint) {
    const sector = this.getSectorData(point);
    return sector.tiles[point.x % SECTOR_SIZE][point.y % SECTOR_SIZE];
  }
}

export default class Player {
  id = 0;
  containerId = 0;
  equipmentContainerId = 0;
  isAdmin = false;
  name = '';
  // skill id -> xp
  skills = new Map<number, number>();
  tilesSeenLog = new TilesSeenLog();

  constructor(public creature: Creature) { }
}
