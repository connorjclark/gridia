import * as Utils from '../utils.js';

export function adjustAttribute(creature: Creature, name: 'life' | 'stamina' | 'mana', delta: number) {
  creature[name].current = Utils.clamp(creature[name].current + delta, 0, creature[name].max);
}

export function attributeCheck(creature: Creature, name: 'life' | 'stamina' | 'mana', amount: number) {
  return creature[name].current >= amount;
}
