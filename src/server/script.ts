import * as Utils from '../utils.js';

import {PlayerConnection} from './client-connection.js';
import {readConfig} from './scripts/script-config-reader.js';
import {Server} from './server.js';
import {TickSection} from './task-runner.js';

export interface CreatureSpawnerState {
  spawnedCreatures: Creature[];
  scheduledSpawnTicks: number[];
}

export abstract class Script<C extends object={}> {
  protected tickSections: TickSection[] = [];
  protected creatureSpawners: CreatureSpawner[] = [];
  protected creatureSpawnerState = new Map<CreatureSpawner, CreatureSpawnerState>();
  // TODO: be able to set these values in-game (drawing a rectangle for a region),
  // and having the script reload.
  protected config: C;
  protected errors: any[] = [];
  private spawnedCreatures: Creature[] = [];
  state = 'stopped';

  constructor(public id: string, protected server: Server, public configSchemaType?: string) {
    if (configSchemaType) {
      const result = readConfig(id, configSchemaType, server.context.scriptConfigStore);
      this.config = result.config as any;
      this.errors = result.errors;
    } else {
      this.config = {} as any;
    }
  }

  setConfig(config: C) {
    this.config = config;
    this.state = 'restarting';
  }

  addError(error: Error | string) {
    if (typeof error === 'string') {
      this.errors.push({text: error});
    } else {
      this.errors.push({text: error.toString(), stack: error});
    }

    // not super great, but maybe ok to do this?
    if (this.errors.length >= 20) {
      this.state = 'failed';
    }
  }

  clearErrors() {
    this.errors = [];
  }

  getScriptState(): ScriptState {
    return {
      id: this.id,
      state: this.state,
      config: this.config,
      configSchemaType: this.configSchemaType,
      errors: this.errors,
    };
  }

  onStart(): Promise<void> | void {
    // Can override.
  }

  onStop(): Promise<void> | void {
    // Can override.
  }

  onTick(): Promise<void> | void {
    // Can override.
  }

  onPlayerCreated(player: Player, playerConnection: PlayerConnection): Promise<void> | void {
    // Can override.
  }

  onPlayerEnterWorld(player: Player, playerConnection: PlayerConnection): Promise<void> | void {
    // Can override.
  }

  onPlayerKillCreature(player: Player, creature: Creature): Promise<void> | void {
    // Can override.
  }

  onPlayerMove(opts: {playerConnection: PlayerConnection; from: Point4; to: Point4}) {
    // Can override.
  }

  onItemAction(opts: {playerConnection: PlayerConnection; location: ItemLocation; to?: ItemLocation}) {
    // Can override.
  }

  async tryCatchFn(fn: () => Promise<any> | void) {
    try {
      await fn();
    } catch (e: any) {
      this.addError(e);
    }
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
          const creature = this.spawnCreatureInternal({descriptor, region: spawner.region});
          if (creature) state.spawnedCreatures.push(creature);
          state.scheduledSpawnTicks.splice(state.scheduledSpawnTicks.indexOf(scheduledTicks), 1);
        }
      }
    }

    return this.onTick();
  }

  unload() {
    for (const section of this.tickSections) {
      this.unregisterTickSection(section);
    }

    for (const spawner of this.creatureSpawners) {
      const state = this.creatureSpawnerState.get(spawner);
      if (!state) throw new Error('missing state');

      for (const creature of state.spawnedCreatures) {
        this.server.removeCreature(creature);
      }
    }
    this.creatureSpawners = [];
    this.creatureSpawnerState.clear();

    for (const creature of this.spawnedCreatures) {
      this.server.removeCreature(creature);
    }
  }

  protected registerTickSection(section: TickSection) {
    this.server.taskRunner.registerTickSection(section);
    this.tickSections.push(section);
  }

  protected unregisterTickSection(section: TickSection) {
    this.server.taskRunner.unregisterTickSection(section);
    const index = this.tickSections.indexOf(section);
    if (index !== -1) this.tickSections.splice(index, 1);
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

  protected spawnCreature(opts: { descriptor: CreatureDescriptor; pos?: Point4; region?: Region }) {
    const creature = this.spawnCreatureInternal(opts);
    if (creature) this.spawnedCreatures.push(creature);
    return creature;
  }

  private spawnCreatureInternal(opts: { descriptor: CreatureDescriptor; pos?: Point4; region?: Region }) {
    let pos;
    if (opts.pos) {
      pos = opts.pos;
    } else if (opts.region) {
      let spawnPos;

      function getRandomLoc(region: Region) {
        const x = region.x + Utils.randInt(0, region.width);
        const y = region.y + Utils.randInt(0, region.height);
        return {w: region.w, x, y, z: region.z};
      }

      // 1 try to pick a random, walkable location (try a few times)
      for (let i = 0; i < 5; i++) {
        const tryLoc = getRandomLoc(opts.region);
        if (this.server.context.walkable(tryLoc)) {
          spawnPos = tryLoc;
          break;
        }
      }

      // 2 if fail, just pick nearest walkable
      if (!spawnPos) {
        spawnPos = this.server.findNearestWalkableTile({region: opts.region});
      }

      // 3 else, just choose a random location
      if (!spawnPos) spawnPos = getRandomLoc(opts.region);

      pos = spawnPos;

      // TODO: find nearest walkable tile INSIDE region.
      // const x = opts.region.x + Utils.randInt(0, opts.region.width);
      // const y = opts.region.y + Utils.randInt(0, opts.region.height);
      // pos = {w: opts.region.w, x, y, z: opts.region.z};
    } else {
      throw new Error('invalid parameters');
    }

    const creature = this.server.createCreature(opts.descriptor, pos);
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
