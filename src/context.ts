import {WorldMap} from './world-map.js';
import {WorldTime} from './world-time.js';

export class Context {
  creatures = new Map<number, Creature>();
  locationToCreature = new Map<string, Creature>();
  containers = new Map<string, Container>();
  secondsPerWorldTick = 20;
  // 8 virtual days per real day.
  ticksPerWorldDay = (24 * 60 * 60) / (this.secondsPerWorldTick * 8);
  // Start new worlds at mid-day.
  time = new WorldTime(this.ticksPerWorldDay, this.ticksPerWorldDay / 2);

  constructor(public worldDataDefinition: WorldDataDefinition, public map: WorldMap) {
  }

  walkable(pos: TilePoint) {
    return this.map.walkable(pos) && !this.getCreatureAt(pos);
  }

  getCreature(id: number): Creature {
    // TODO omg rm this.
    // @ts-expect-error: how to handle when creature does not exist?
    return this.creatures.get(id);
  }

  getCreatureAt(pos: TilePoint): Creature | undefined {
    return this.locationToCreature.get(`${pos.w},${pos.x},${pos.y},${pos.z}`);
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
    }
  }
}
