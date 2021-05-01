import WorldMap from './world-map';
import { SECTOR_SIZE } from './constants';
import * as Utils from './utils';
import * as Content from './content';

export const ATTRIBUTES = [
  'dexterity',
  'intelligence',
  'life',
  'mana',
  'quickness',
  'stamina',
  'strength',
  'wisdom',
] as const;
type Attribute = typeof ATTRIBUTES[number];

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

function costToIncrementCombatLevel(level: number) {
  const x = level;
  return Math.round(295.5543 * Math.pow(x, 3) - 1749.6641 * Math.pow(x, 2) + 5625.2909 * x - 4182.4037);
}

const combatLevelToXpTotal: number[] = [];
{
  let xp = 0;
  for (let i = 0; i < 500; i++) {
    combatLevelToXpTotal.push(xp);
    xp += costToIncrementCombatLevel(i);
  }
}

function combatLevelForXp(xp: number) {
  const index = combatLevelToXpTotal.findIndex((threshold) => threshold > xp);
  if (index === -1) return combatLevelToXpTotal.length;
  return index - 1;
}

export function getXpTotalForCombatLevel(level: number) {
  return combatLevelToXpTotal[level];
}

export function getAttributeValue(player: Player, id: Attribute) {
  const data = player.attributes.get(id);
  if (!ATTRIBUTES.includes(id) || !data) throw new Error('unknown attribute ' + id);

  const { baseLevel, earnedLevel } = data;
  return {
    baseLevel,
    earnedLevel,
    level: baseLevel + earnedLevel,
    xpUntilNextLevel: costToIncrementSkillOrAttribute(earnedLevel),
  };
}

export function incrementAttribute(player: Player, id: Attribute) {
  const data = player.attributes.get(id);
  if (!ATTRIBUTES.includes(id) || !data) throw new Error('unknown attribute ' + id);

  data.earnedLevel += 1;
}

export function getLearnedSkills(player: Player) {
  return [...player.skills.keys()];
}

function getSkillLevel(player: Player, id: number) {
  const xp = player.skills.get(id)?.xp || 0;
  const skill = Content.getSkill(id);
  let baseLevelSum = 0;
  for (const attribute of ATTRIBUTES) {
    const multiplier = skill[attribute as keyof Skill];
    if (!multiplier || typeof multiplier !== 'number') continue;

    baseLevelSum += multiplier * getAttributeValue(player, attribute).level;
  }
  const baseLevel = Math.floor(baseLevelSum / skill.divisor);
  const earnedLevel = skillOrAttributeLevelForXp(xp);
  return { baseLevel, earnedLevel, level: baseLevel + earnedLevel };
}

// TODO rename details
export function getSkillValue(player: Player, buffs: Buff[], id: number) {
  const xp = player.skills.get(id)?.xp || 0;
  const { baseLevel, earnedLevel, level } = getSkillLevel(player, id);

  let percentChange = 0;
  let linearChange = 0;
  for (const buff of buffs) {
    if (buff.skill === id) {
      if (buff.percentChange) percentChange += buff.percentChange;
      if (buff.linearChange) linearChange += buff.linearChange;
    }
  }
  const buffAmount = Math.floor(level * (percentChange) + linearChange);

  return {
    xp,
    baseLevel,
    earnedLevel,
    buffAmount,
    level: level + buffAmount,
    xpUntilNextLevel: attributeLevelToXpTotal[earnedLevel + 1] - xp,
  };
}

export function getCombatLevel(player: Player) {
  const skills = new Set([
    'Melee Defense',
    'Missle Defense',
    'Magic Defense',
  ]);
  for (const skill of Content.getSkills()) {
    if (skill.purpose) skills.add(skill.name);
  }

  let xp = 0;
  for (const skillName of skills) {
    const skill = Content.getSkillByName(skillName);
    if (skill === undefined) continue;
    xp += player.skills.get(skill.id)?.xp || 0;
  }

  const combatLevel = combatLevelForXp(xp);
  return {
    xp,
    combatLevel,
    xpUntilNextLevel: combatLevelToXpTotal[combatLevel + 1] - xp,
  };
}

export function hasSkill(player: Player, id: number) {
  return player.skills.has(id);
}

export function learnSkill(player: Player, id: number) {
  if (player.skills.has(id)) return;

  player.skills.set(id, { xp: 0 });
}

export function incrementSkillXp(player: Player, id: number, xp: number) {
  const obj = player.skills.get(id);
  if (obj === undefined || xp <= 0) return;

  const skillLevelBefore = getSkillLevel(player, id).earnedLevel;
  const combatLevelBefore = getCombatLevel(player).combatLevel;
  obj.xp += xp;
  return {
    skillLevelIncreased: skillLevelBefore !== getSkillLevel(player, id).earnedLevel,
    combatLevelIncreased: combatLevelBefore !== getCombatLevel(player).combatLevel,
  };
}

export function startQuest(player: Player, quest: Quest) {
  let state = player.questStates.get(quest.id);
  if (state) return;

  state = {
    stage: quest.stages[0],
    data: {},
  };
  player.questStates.set(quest.id, state);
}

export function getQuestState(player: Player, quest: Quest) {
  return player.questStates.get(quest.id);
}

export function advanceQuest(player: Player, quest: Quest) {
  const state = player.questStates.get(quest.id);
  if (!state) return;

  const currentIndex = quest.stages.indexOf(state.stage);
  if (currentIndex === quest.stages.length - 1) return;

  state.stage = quest.stages[currentIndex + 1];
}

function getTileSeenSectorData(player: Player, point: TilePoint) {
  const sectorPoint = Utils.worldToSector(point, SECTOR_SIZE);
  const key = `${point.w},${sectorPoint.x},${sectorPoint.y},${sectorPoint.z}`;

  let data = player.tilesSeenLog.get(key);
  if (!data) {
    data = new Uint16Array(SECTOR_SIZE * SECTOR_SIZE);
    player.tilesSeenLog.set(key, data);
  }

  return data;
}

export function getTileSeenData(player: Player, point: TilePoint) {
  const data = getTileSeenSectorData(player, point);
  return sectorTileSeenLogGet(data, point.x % SECTOR_SIZE, point.y % SECTOR_SIZE);
}

export function markTileSeen(player: Player, map: WorldMap, point: TilePoint) {
  if (!map.inBounds(point)) return;

  const data = getTileSeenSectorData(player, point);
  const tile = map.getTile(point);
  const walkable = !tile.item || Content.getMetaItem(tile.item.type).walkable;
  sectorTileSeenLogSet(data, point.x % SECTOR_SIZE, point.y % SECTOR_SIZE, tile.floor, walkable);
}

export function sectorTileSeenLogGet(data: Uint16Array, x: number, y: number) {
  const num = data[x + y * SECTOR_SIZE];
  // eslint-disable-next-line no-bitwise
  return { floor: num >> 1, walkable: num % 2 === 1 };
}

function sectorTileSeenLogSet(data: Uint16Array, x: number, y: number, floor: number, walkable: boolean) {
  // eslint-disable-next-line no-bitwise
  data[x + y * SECTOR_SIZE] = (floor << 1) + (walkable ? 1 : 0);
}
