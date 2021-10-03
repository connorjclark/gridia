import * as Utils from '../utils.js';

import {ClientConnection} from './client-connection.js';
import {ScriptConfigStore} from './scripts/script-config-store.js';
import {Server} from './server.js';
import {Rate} from './task-runner.js';

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

type ConfigDefinition = Record<string, 'Region'|'number'>;

export type MapConfigType<T extends ConfigDefinition> = Required<{ [K in keyof T]?:
  T[K] extends 'Region' ? Region :
    T[K] extends 'number' ? number :
      never
}>;

function readConfig<T extends ConfigDefinition>(
  scriptName: string, configDef: T, configStore: ScriptConfigStore): {config: MapConfigType<T>; errors: any[]} {

  // @ts-expect-error
  const config: MapConfigType<T> = {};
  for (const [k, v] of Object.entries(configDef)) {
    const key = `${scriptName}.${k}`;
    if (v === 'Region') {
      // @ts-expect-error
      config[k] = configStore.getRegion(key);
    } else if (v === 'number') {
      // @ts-expect-error
      config[k] = configStore.getNumber(key);
    }
  }

  const errors = configStore.takeErrors();
  return {config, errors};
}

export abstract class Script<C extends ConfigDefinition> {
  protected creatureSpawners: CreatureSpawner[] = [];
  protected creatureSpawnerState = new Map<CreatureSpawner, CreatureSpawnerState>();
  // TODO: be able to set these values in-game (drawing a rectangle for a region),
  // and having the script reload.
  protected config: MapConfigType<C>;
  protected errors: any[] = [];
  state = 'not-started';

  constructor(public id: string, protected server: Server, public configDefinition: C) {
    const result = readConfig(id, configDefinition, server.context.scriptConfigStore);
    this.config = result.config;
    this.errors = result.errors;
  }

  getScriptState() {
    return {
      id: this.id,
      config: this.config,
      errors: this.errors,
    };
  }

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
          const creature = this.spawnCreature({descriptor, region: spawner.region});
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
      loc = {w: opts.region.w, x, y, z: opts.region.z};
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
