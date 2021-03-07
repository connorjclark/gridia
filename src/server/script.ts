import * as Utils from '../utils';
import Server from './server';
import { Rate } from './task-runner';

type Region = Point4 & { width: number; height: number };

interface CreatureSpawner {
  types: number[];
  limit: number;
  rate: Rate;
  region: Region;
}

interface CreatureSpawnerState {
  spawnedCreatures: Creature[];
  scheduledSpawnTicks: number[];
}

export abstract class Script {
  protected creatureSpawners: CreatureSpawner[] = [];
  protected creatureSpawnerState = new Map<CreatureSpawner, CreatureSpawnerState>();

  constructor(protected server: Server) { }

  // TODO: time budget for tick.
  // TODO: only run script if player is nearby.
  tick(): Promise<void> {
    const ticks = this.server.taskRunner.getTicks();

    for (const spawner of this.creatureSpawners) {
      const state = this.creatureSpawnerState.get(spawner);
      if (!state) throw new Error('missing state');

      for (const creature of state.spawnedCreatures) {
        if (!this.server.context.creatures.has(creature.id)) {
          state.spawnedCreatures.splice(state.spawnedCreatures.indexOf(creature), 1);
        }
      }

      if (state.spawnedCreatures.length + state.scheduledSpawnTicks.length < spawner.limit) {
        state.scheduledSpawnTicks.push(ticks + this.server.taskRunner.rateToTicks(spawner.rate));
      }

      for (const scheduledTicks of state.scheduledSpawnTicks) {
        if (scheduledTicks <= ticks) {
          const type = spawner.types[Utils.randInt(0, spawner.types.length - 1)];
          const creature = this.spawnCreature({ type, region: spawner.region });
          if (creature) state.spawnedCreatures.push(creature);
          state.scheduledSpawnTicks.splice(state.scheduledSpawnTicks.indexOf(scheduledTicks), 1);
        }
      }
    }

    return Promise.resolve();
  }

  addCreatureSpawner(spawner: CreatureSpawner) {
    this.creatureSpawners.push(spawner);
    this.creatureSpawnerState.set(spawner, {
      spawnedCreatures: [],
      scheduledSpawnTicks: [],
    });
  }

  unload() {
    for (const spawner of this.creatureSpawners) {
      const state = this.creatureSpawnerState.get(spawner);
      if (!state) throw new Error('missing state');

      for (const creature of state.spawnedCreatures) {
        this.server.removeCreature(creature);
      }
      state.spawnedCreatures = [];
      state.scheduledSpawnTicks = [];
    }
  }

  spawnCreature(opts: { type: number; loc?: Point4; region?: Region }) {
    if (opts.loc && opts.region) {
      throw new Error('invalid parameters');
    }

    let loc;
    if (opts.loc) {
      loc = opts.loc;
    } else if (opts.region) {
      // TODO: find nearest walkable tile INSIDE region.
      const x = opts.region.x + Utils.randInt(0, opts.region.width);
      const y = opts.region.y + Utils.randInt(0, opts.region.height);
      loc = { w: opts.region.w, x, y, z: opts.region.z };
    } else {
      throw new Error('invalid parameters');
    }

    const creature = this.server.makeCreatureFromTemplate(opts.type, loc);
    return creature;
  }
}

export class TestScript extends Script {
  constructor(server: Server) {
    super(server);

    this.addCreatureSpawner({
      types: [41, 43, 98],
      limit: 10,
      rate: { seconds: 5 },
      region: { w: 0, x: 25, y: 20, z: 0, width: 25, height: 12 },
    });
  }
}
