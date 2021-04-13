import * as Utils from '../utils';

export function adjustAttribute(creature: Creature, name: 'life' | 'stamina' | 'mana', delta: number) {
  creature[name].current = Utils.clamp(creature[name].current + delta, 0, creature[name].max);
}
