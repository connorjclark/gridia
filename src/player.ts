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

function costToIncrementSkillOrAttribute(level: number) {
  const x = level;
  return Math.round(0.0391 * Math.pow(x, 3) + 5.0616 * Math.pow(x, 2) + 4.8897 * x + 100);
}

const attributeLevelToXpTotal: number[] = [];
{
  let xp = 0;
  for (let i = 0; i < 1000; i++) {
    attributeLevelToXpTotal.push(xp);
    xp += costToIncrementSkillOrAttribute(i);
  }
}

function skillOrAttributeLevelForXp(xp: number) {
  const index = attributeLevelToXpTotal.findIndex((threshold) => threshold > xp);
  if (index === -1) return attributeLevelToXpTotal.length;
  return index - 1;
}

export function getXpTotalForLevel(level: number) {
  return attributeLevelToXpTotal[level];
}

type Attribute = typeof PlayerAttributes.ATTRIBUTES[number];
export class PlayerAttributes {
  static ATTRIBUTES = [
    'dexterity',
    'intelligence',
    'life',
    'mana',
    'quickness',
    'stamina',
    'strength',
    'wisdom',
  ] as const;

  constructor(public values: Record<Attribute, { baseLevel: number; earnedLevel: number }>) {
    // @ts-expect-error
    if (!values) values = {};
    for (const attribute of PlayerAttributes.ATTRIBUTES) {
      if (!values[attribute]) values[attribute] = { baseLevel: 0, earnedLevel: 0 };
    }
  }

  getValue(id: Attribute) {
    if (!PlayerAttributes.ATTRIBUTES.includes(id)) throw new Error('unknown attribute ' + id);

    const { baseLevel, earnedLevel } = this.values[id];
    return {
      baseLevel,
      earnedLevel,
      level: baseLevel + earnedLevel,
      xpUntilNextLevel: costToIncrementSkillOrAttribute(earnedLevel),
    };
  }

  incrementLevel(id: Attribute) {
    if (!PlayerAttributes.ATTRIBUTES.includes(id)) throw new Error('unknown attribute ' + id);

    this.values[id].earnedLevel += 1;
  }
}

export class PlayerSkills {
  xps = new Map<number, number>();

  constructor(private attributes: PlayerAttributes) {
  }

  getLearnedSkills() {
    return [...this.xps.keys()];
  }

  getValue(id: number) {
    const xp = this.xps.get(id) || 0;
    const { baseLevel, earnedLevel, level } = this.getLevel(id);
    return {
      xp,
      baseLevel,
      earnedLevel,
      level,
      xpUntilNextLevel: attributeLevelToXpTotal[earnedLevel + 1] - xp,
    };
  }

  getLevel(id: number) {
    const xp = this.xps.get(id) || 0;
    const skill = Content.getSkill(id);
    let baseLevelSum = 0;
    for (const attribute of PlayerAttributes.ATTRIBUTES) {
      const multiplier = skill[attribute as keyof Skill];
      if (!multiplier || typeof multiplier !== 'number') continue;

      baseLevelSum += multiplier * this.attributes.getValue(attribute).level;
    }
    const baseLevel = Math.floor(baseLevelSum / skill.divisor);
    const earnedLevel = skillOrAttributeLevelForXp(xp);
    return { baseLevel, earnedLevel, level: baseLevel + earnedLevel };
  }

  hasSkill(id: number) {
    return this.xps.has(id);
  }

  learnSkill(id: number) {
    if (this.xps.has(id)) return;

    this.xps.set(id, 0);
  }

  incrementXp(id: number, xp: number) {
    const value = this.xps.get(id);
    if (value === undefined) return;

    this.xps.set(id, value + xp);
  }
}

export default class Player {
  id = '';
  containerId = '';
  equipmentContainerId = '';
  isAdmin = false;
  name = '';
  questStates = new Map<string, QuestState>();
  // @ts-expect-error
  attributes = new PlayerAttributes({});
  skills = new PlayerSkills(this.attributes);
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
