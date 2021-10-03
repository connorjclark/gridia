import {WorldMap} from './world-map.js';

export class Context {
  creatures = new Map<number, Creature>();
  locationToCreature = new Map<string, Creature>();
  containers = new Map<string, Container>();

  constructor(public worldDataDefinition: WorldDataDefinition, public map: WorldMap) {
  }

  walkable(loc: TilePoint) {
    return this.map.walkable(loc) && !this.getCreatureAt(loc);
  }

  getCreature(id: number): Creature {
    // TODO omg rm this.
    // @ts-ignore: how to handle when creature does not exist?
    return this.creatures.get(id);
  }

  getCreatureAt(loc: TilePoint): Creature | undefined {
    return this.locationToCreature.get(`${loc.w},${loc.x},${loc.y},${loc.z}`);
  }

  setCreature(creature: Creature) {
    this.creatures.set(creature.id, creature);
    const pos = creature.pos;
    this.locationToCreature.set(`${pos.w},${pos.x},${pos.y},${pos.z}`, creature);
  }

  syncCreaturesOnTiles() {
    this.locationToCreature.clear();
    for (const creature of this.creatures.values()) {
      const pos = creature.pos;
      this.locationToCreature.set(`${pos.w},${pos.x},${pos.y},${pos.z}`, creature);
    }
  }

  removeCreature(id: number) {
    const creature = this.creatures.get(id);
    if (creature) {
      this.creatures.delete(id);
      // delete this.map.getTile(creature.pos).creature;
    }
  }
}
