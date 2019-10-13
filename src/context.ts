import Container from './container';
import WorldMap from './world-map';

export class Context {
  public map: WorldMap;
  public creatures = new Map<number, Creature>();
  public containers = new Map<number, Container>();

  constructor(map: WorldMap) {
    this.map = map;
  }

  // TODO how to handle when creature does not exist?
  public getCreature(id: number): Creature {
    return this.creatures.get(id);
  }

  public setCreature(creature: Creature) {
    this.creatures.set(creature.id, creature);
    this.map.getTile(creature.pos).creature = creature;
  }

  public removeCreature(id: number) {
    const creature = this.creatures.get(id);
    if (creature) {
      this.creatures.delete(id);
      delete this.map.getTile(creature.pos).creature;
    }
  }
}
