import Container from './container';
import WorldMap from './world-map';

export class Context {
  public creatures = new Map<number, Creature>();
  public containers = new Map<number, Container>();

  public constructor(public map: WorldMap) {
  }

  public getCreature(id: number): Creature {
    // TODO omg rm this.
    // @ts-ignore: how to handle when creature does not exist?
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
