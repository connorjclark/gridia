import Container from './container';
import WorldMap from './world-map';

export class Context {
  creatures = new Map<number, Creature>();
  containers = new Map<number, Container>();

  constructor(public map: WorldMap) {
  }

  getCreature(id: number): Creature {
    // TODO omg rm this.
    // @ts-ignore: how to handle when creature does not exist?
    return this.creatures.get(id);
  }

  setCreature(creature: Creature) {
    this.creatures.set(creature.id, creature);
    this.map.getTile(creature.pos).creature = creature;
  }

  removeCreature(id: number) {
    const creature = this.creatures.get(id);
    if (creature) {
      this.creatures.delete(id);
      delete this.map.getTile(creature.pos).creature;
    }
  }
}
