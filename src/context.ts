import Container from './container';
import WorldMap from './world-map';

export class Context {
  public map: WorldMap;
  public creatures: Record<number, Creature> = {};
  public containers: Map<number, Container> = new Map();

  constructor(map: WorldMap) {
    this.map = map;
  }

  // TODO how to handle when creature does not exist?
  public getCreature(id: number): Creature {
    return this.creatures[id];
  }

  public setCreature(creature: Creature) {
    this.creatures[creature.id] = creature;
    this.map.getTile(creature.pos).creature = creature;
  }
}
