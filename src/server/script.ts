import * as Utils from '../utils';
import Player from '../player';
import Server from './server';
import { Rate } from './task-runner';
import ClientConnection from './client-connection';

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

  onStart(): Promise<void> | void {
    // Can override.
  }

  onTick(): Promise<void> | void {
    // Can override.
  }

  onPlayerRegister(player: Player, clientConnection: ClientConnection): Promise<void> | void {
    // Can override.
  }

  onPlayerLogin(player: Player, clientConnection: ClientConnection): Promise<void> | void {
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
          const type = spawner.types[Utils.randInt(0, spawner.types.length - 1)];
          const creature = this.spawnCreature({ type, region: spawner.region });
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

  protected addCreatureSpawner(spawner: CreatureSpawner) {
    this.creatureSpawners.push(spawner);
    this.creatureSpawnerState.set(spawner, {
      spawnedCreatures: [],
      scheduledSpawnTicks: [],
    });
  }

  protected spawnCreature(opts: { type: number; loc?: Point4; region?: Region }) {
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

  protected wasCreatureSpawnedBySpawner(creature: Creature) {
    for (const state of this.creatureSpawnerState.values()) {
      if (state.spawnedCreatures.includes(creature)) {
        return true;
      }
    }

    return false;
  }
}

export class TestScript extends Script {
  captain?: Creature;

  constructor(server: Server) {
    super(server);

    this.addCreatureSpawner({
      types: [41, 43, 98],
      limit: 10,
      rate: { seconds: 5 },
      region: { w: 0, x: 25, y: 20, z: 0, width: 25, height: 12 },
    });
  }

  onStart() {
    this.server.registerQuest({
      id: 'TEST_QUEST',
      name: 'Your First Quest',
      stages: [
        'in_room',
        'find_captain',
        'find_kitchen',
        'cook_ribs',
        'collect_meat',
        'cook_meat',
        'return_to_captain',
        'leave_ship',
      ],
    });
  }

  onTick() {
    if (!this.captain || this.captain.dead) {
      this.captain = this.spawnCreature({ type: 11, loc: { w: 0, x: 25, y: 20, z: 0 } });
      if (this.captain) {
        this.captain.name = 'Captain Jack';
        this.server.broadcastPartialCreatureUpdate(this.captain, ['name']);
      }
    }

    // const region = this.creatureSpawners[0].region;

    // const quest = this.server.getQuest('TEST_QUEST');
    // for (const player of this.server.players.values()) {
    //   console.log(player.name, player.getQuestState(quest)?.stage);
    // }

    // ...
  }

  onPlayerRegister(player: Player) {
    this.server.moveCreature(player.creature, this.creatureSpawners[0].region);

    const quest = this.server.getQuest('TEST_QUEST');
    player.startQuest(quest);
  }

  onPlayerLogin(player: Player) {
    const quest = this.server.getQuest('TEST_QUEST');
    player.startQuest(quest);
  }

  onPlayerKillCreature(player: Player, creature: Creature) {
    if (!this.wasCreatureSpawnedBySpawner(creature)) return;

    const quest = this.server.getQuest('TEST_QUEST');
    player.advanceQuest(quest);
  }
}
