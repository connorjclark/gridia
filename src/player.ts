import {SECTOR_SIZE} from './constants';
import {EQUIP_SLOTS} from './container';
import * as Content from './content';
import * as Utils from './utils';
import {WorldMap} from './world-map';

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
  return Math.round(295.5543 * Math.pow(x, 3) - 1749.6641 * Math.pow(x, 2) + 5625.2909 * x);
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

export function getAttributeValue(player: Player, id: Attribute, buffs: Buff[]) {
  const data = player.attributes.get(id);
  if (!ATTRIBUTES.includes(id) || !data) throw new Error('unknown attribute ' + id);

  let percentChange = 0;
  let linearChange = 0;
  for (const buff of buffs) {
    if (buff.attribute === id) {
      if (buff.percentChange) percentChange += buff.percentChange;
      if (buff.linearChange) linearChange += buff.linearChange;
    }
  }

  const {baseLevel, earnedLevel} = data;
  const buffAmount = Math.floor((baseLevel + earnedLevel) * (percentChange) + linearChange);
  return {
    baseLevel,
    earnedLevel,
    buffAmount,
    level: baseLevel + earnedLevel + buffAmount,
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

export function getUnlearnedSkills(player: Player) {
  const skills = [];
  for (const skill of Content.getSkills()) {
    if (!player.skills.has(skill.id)) skills.push(skill);
  }
  return skills;
}

function getSkillLevel(player: Player, id: number, buffs: Buff[] = []) {
  let percentChange = 0;
  let linearChange = 0;
  for (const buff of buffs) {
    if (buff.skill === id || buff.skill === -1) {
      if (buff.percentChange) percentChange += buff.percentChange;
      if (buff.linearChange) linearChange += buff.linearChange;
    }
  }

  const xp = player.skills.get(id)?.xp || 0;
  const skill = Content.getSkill(id);
  let baseLevelSum = 0;
  let baseLevelSumFromBuffs = 0;
  for (const attribute of ATTRIBUTES) {
    const multiplier = skill[attribute as keyof Skill];
    if (!multiplier || typeof multiplier !== 'number') continue;

    const attrValue = getAttributeValue(player, attribute, buffs);
    baseLevelSum += multiplier * (attrValue.baseLevel + attrValue.earnedLevel);
    baseLevelSumFromBuffs += multiplier * attrValue.buffAmount;
  }

  const baseLevel = Math.floor(baseLevelSum / skill.divisor);
  const baseLevelFromBuffs = Math.floor(baseLevelSumFromBuffs / skill.divisor);
  const buffAmount = baseLevelFromBuffs + Math.floor(baseLevel * (percentChange) + linearChange);
  const earnedLevel = skillOrAttributeLevelForXp(xp);
  const level = baseLevel + earnedLevel + buffAmount;
  return {baseLevel, earnedLevel, buffAmount, level};
}

// TODO rename details
export function getSkillValue(player: Player, buffs: Buff[], id: number) {
  const xp = player.skills.get(id)?.xp || 0;
  const {baseLevel, earnedLevel, buffAmount, level} = getSkillLevel(player, id, buffs);

  return {
    xp,
    baseLevel,
    earnedLevel,
    buffAmount,
    level,
    xpUntilNextLevel: attributeLevelToXpTotal[earnedLevel + 1] - xp,
  };
}

export function getCombatLevel(player: Player) {
  const skills = new Set<number>();
  for (const skill of Content.getSkills()) {
    if (skill.category === 'combat' || skill.category === 'combat basics') skills.add(skill.id);
  }

  let xp = 0;
  for (const id of skills) {
    const skill = Content.getSkill(id);
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

  player.skills.set(id, {xp: 0});
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
  if (state) return state;

  state = {
    stage: quest.stages[0],
    data: {},
  };
  player.questStates.set(quest.id, state);
  return state;
}

export function getQuestState(player: Player, quest: Quest) {
  return player.questStates.get(quest.id);
}

export function hasStartedQuest(player: Player, quest: Quest): boolean {
  return player.questStates.has(quest.id);
}

export function getQuestStatusMessage(player: Player, quest: Quest): string {
  const parts = [
    `Quest: ${quest.name}`,
    quest.description,
  ];

  const state = getQuestState(player, quest);
  if (state) {
    parts.push(`Current stage: ${state.stage} (${quest.stages.indexOf(state.stage) + 1} / ${quest.stages.length})`);
    if (Object.keys(state.data).length) parts.push(JSON.stringify(state.data, null, 2));
  } else {
    parts.push('Current stage: Not Started');
  }

  return parts.join('\n');
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
  return {floor: num >> 1, walkable: num % 2 === 1};
}

function sectorTileSeenLogSet(data: Uint16Array, x: number, y: number, floor: number, walkable: boolean) {
  // eslint-disable-next-line no-bitwise
  data[x + y * SECTOR_SIZE] = (floor << 1) + (walkable ? 1 : 0);
}

// TODO shouldnt be here ...
export function getCombatAttackType(equipment: Container) {
  let attackSkill = Content.getSkillByNameOrThrowError('Unarmed Attack');
  const weaponType = equipment.items[EQUIP_SLOTS.Weapon]?.type;
  const weaponMeta = weaponType ? Content.getMetaItem(weaponType) : null;
  if (weaponMeta && weaponMeta.combatSkill !== undefined) {
    const skill = Content.getSkill(weaponMeta.combatSkill);
    if (skill) attackSkill = skill;
  }

  if (weaponMeta?.class === 'Wand' && weaponMeta.combatSkill) attackSkill = Content.getSkill(weaponMeta.combatSkill);

  return attackSkill.purpose;
}
