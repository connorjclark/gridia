import WorldMap from './world-map';
import { SECTOR_SIZE } from './constants';
import * as Utils from './utils';
import * as Content from './content';

export class SectorTileSeenLogData {
  data = new Uint16Array(SECTOR_SIZE * SECTOR_SIZE);

  get(x: number, y: number) {
    const num = this.data[x + y * SECTOR_SIZE];
    // eslint-disable-next-line no-bitwise
    return { floor: num >> 1, walkable: num % 2 === 1 };
  }

  set(x: number, y: number, floor: number, walkable: boolean) {
    // eslint-disable-next-line no-bitwise
    this.data[x + y * SECTOR_SIZE] = (floor << 1) + (walkable ? 1 : 0);
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
    const walkable = !tile.item || Content.getMetaItem(tile.item.type).walkable;
    sector.set(point.x % SECTOR_SIZE, point.y % SECTOR_SIZE, tile.floor, walkable);
  }

  getMark(point: TilePoint) {
    const sector = this.getSectorData(point);
    return sector.get(point.x % SECTOR_SIZE, point.y % SECTOR_SIZE);
  }
}

export default class Player {
  id = 0;
  containerId = 0;
  equipmentContainerId = 0;
  isAdmin = false;
  name = '';
  questStates = new Map<string, QuestState>();
  // skill id -> xp
  skills = new Map<number, number>();
  tilesSeenLog = new TilesSeenLog();

  constructor(public creature: Creature) { }

  getQuestState(quest: Quest) {
    return this.questStates.get(quest.id);
  }

  startQuest(quest: Quest) {
    let state = this.questStates.get(quest.id);
    if (state) return;

    state = {
      stage: quest.stages[0],
      data: {},
    };
    this.questStates.set(quest.id, state);
  }

  advanceQuest(quest: Quest) {
    const state = this.questStates.get(quest.id);
    if (!state) return;

    const currentIndex = quest.stages.indexOf(state.stage);
    if (currentIndex === quest.stages.length - 1) return;

    state.stage = quest.stages[currentIndex + 1];
  }
}
