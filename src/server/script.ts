import * as Utils from '../utils';
import Server from './server';
import { Rate } from './task-runner';
import ClientConnection from './client-connection';
import { ScriptConfigStore } from './scripts/script-config-store';

interface CreatureSpawner {
  descriptors: CreatureDescriptor[];
  limit: number;
  rate: Rate;
  region: Region;
}

interface CreatureSpawnerState {
  spawnedCreatures: Creature[];
  scheduledSpawnTicks: number[];
}

export abstract class Script<Config> {
  protected creatureSpawners: CreatureSpawner[] = [];
  protected creatureSpawnerState = new Map<CreatureSpawner, CreatureSpawnerState>();
  protected config: Config;

  constructor(protected server: Server) {
    this.config = this.readConfig(server.context.scriptConfigStore);
  }

  abstract readConfig(store: ScriptConfigStore): Config;

  onStart(): Promise<void> | void {
    // Can override.
  }

  onTick(): Promise<void> | void {
    // Can override.
  }

  onPlayerCreated(player: Player, clientConnection: ClientConnection): Promise<void> | void {
    // Can override.
  }

  onPlayerEnterWorld(player: Player, clientConnection: ClientConnection): Promise<void> | void {
    // Can override.
  }

  onPlayerKillCreature(player: Player, creature: Creature): Promise<void> | void {
    // Can override.
  }

  // TODO: time budget for tick.
  // TODO: only run script if player is nearby.
  tick(): Promise<void> | void {
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
          const descriptor = spawner.descriptors[Utils.randInt(0, spawner.descriptors.length - 1)];
          const creature = this.spawnCreature({ descriptor, region: spawner.region });
          if (creature) state.spawnedCreatures.push(creature);
          state.scheduledSpawnTicks.splice(state.scheduledSpawnTicks.indexOf(scheduledTicks), 1);
        }
      }
    }

    return this.onTick();
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

  protected addCreatureSpawner(spawner: CreatureSpawner): CreatureSpawnerState {
    this.creatureSpawners.push(spawner);
    const state = {
      spawnedCreatures: [],
      scheduledSpawnTicks: [],
    };
    this.creatureSpawnerState.set(spawner, state);
    return state;
  }

  protected spawnCreature(opts: { descriptor: CreatureDescriptor; loc?: Point4; region?: Region }) {
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

    const creature = this.server.createCreature(opts.descriptor, loc);
    return creature;
  }

  // TODO: remove?
  // protected wasCreatureSpawnedBySpawner(creature: Creature) {
  //   for (const state of this.creatureSpawnerState.values()) {
  //     if (state.spawnedCreatures.includes(creature)) {
  //       return true;
  //     }
  //   }

  //   return false;
  // }
}
