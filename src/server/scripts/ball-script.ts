import * as Content from '../../content.js';
import * as Utils from '../../utils.js';
import {PlayerConnection} from '../client-connection.js';
import {Action, Goal} from '../creature-state.js';
import {Script} from '../script.js';
import {Server} from '../server.js';

interface Kick {
  item: Item;
  pos: Point4;
  posFloating: Point4;
  dir: Point2;
  momentum: number;
}

const creatureToFetchState = new WeakMap<Creature, {done: boolean; kick: Kick; hasItem?: Item}>();
const FetchAction: Action = {
  name: 'Fetch',
  cost: 1,
  preconditions: [],
  effects: ['fetch'],
  tick(server: Server) {
    const state = creatureToFetchState.get(this.creature);
    if (!state || !this.creature.tamedBy) return false;

    this.goto(state.kick.pos);

    if (!state.hasItem) {
      if (Utils.equalPoints(this.creature.pos, state.kick.pos)) {
        const item = server.context.map.getItem(state.kick.pos);
        if (!item) return false;
        server.clearItem(Utils.ItemLocation.World(state.kick.pos));
        state.hasItem = item;
      }
    } else {
      const tamedByPlayer = server.context.players.get(this.creature.tamedBy);
      if (!tamedByPlayer) return false;

      const tamedByCreature = server.getClientConnectionForPlayer(tamedByPlayer)?.creature;
      if (!tamedByCreature) return false;

      this.goto(tamedByCreature.pos);

      if (Utils.maxDiff(this.creature.pos, tamedByCreature.pos) <= 1) {
        state.done = true;
        return true;
      }
    }
  },
};

export class BallScript extends Script<{}> {
  private activeKicks: Kick[] = [];

  constructor(protected server: Server) {
    super('ball', server, {});
  }

  onStart() {
    this.server.taskRunner.registerTickSection({
      description: 'ball script',
      rate: {ms: 75},
      fn: () => {
        for (let i = this.activeKicks.length - 1; i >= 0; i-- ) {
          const kick = this.activeKicks[i];

          const ballDestX = kick.posFloating.x + Utils.clamp(kick.dir.x, -1, 1);
          const ballDestY = kick.posFloating.y + Utils.clamp(kick.dir.y, -1, 1);
          const newLocFloating = {...kick.pos, x: ballDestX, y: ballDestY};
          const newLoc = {...kick.pos, x: Math.round(ballDestX), y: Math.round(ballDestY)};
          const itemAtNewLoc = !Utils.equalPoints(kick.pos, newLoc) && this.server.context.map.getItem(newLoc);

          if (itemAtNewLoc && Content.getMetaItem(itemAtNewLoc.type).class === 'Goal') {
            this.server.setItemInWorld(kick.pos, undefined);
            this.server.setItemInWorld(newLoc, {type: itemAtNewLoc.type + 1, quantity: 1});
            kick.momentum = 0;
          } else if (itemAtNewLoc) {
            if (kick.dir.x && kick.dir.y) {
              kick.dir.y *= -1;
            } else {
              kick.dir.x *= -1;
              kick.dir.y *= -1;
            }
          } else {
            this.server.setItemInWorld(kick.pos, undefined);
            this.server.setItemInWorld(newLoc, kick.item);
            kick.pos = newLoc;
            kick.posFloating = newLocFloating;
          }

          kick.momentum -= 1;
          if (kick.momentum <= 0) this.activeKicks.splice(i, 1);
        }
      },
    });
  }

  onPlayerMove(opts: {playerConnection: PlayerConnection; from: Point4; to: Point4}) {
    const item = this.server.context.map.getItem(opts.to);
    if (!item || Content.getMetaItem(item.type).class !== 'Ball') return;

    const dir = Utils.direction(opts.from, opts.to);
    const momentum = Utils.randInt(3, 5);
    const indexOfActiveKick = this.activeKicks.findIndex((kick) => kick.item === item);
    if (indexOfActiveKick !== -1) {
      this.activeKicks[indexOfActiveKick].dir = dir;
      this.activeKicks[indexOfActiveKick].momentum = momentum;
    } else {
      this.activeKicks.push({
        item,
        pos: opts.to,
        posFloating: {...opts.to},
        dir,
        momentum,
      });
    }
  }

  async onItemAction(opts:
  {playerConnection: PlayerConnection; type: string; location: ItemLocation; to?: ItemLocation}) {
    if (opts.type !== 'throw') return;
    if (opts.location.source !== 'container' || opts.to?.source !== 'world') return;

    const item = await this.server.getItem(opts.location);
    if (!item || Content.getMetaItem(item.type).class !== 'Ball') return;

    const throwerLoc = opts.playerConnection.creature.pos;
    const dir = Utils.direction(throwerLoc, opts.to.pos);

    const startingLocFirstAttempt =
      {...throwerLoc, x: throwerLoc.x + Math.sign(dir.x), y: throwerLoc.y + Math.sign(dir.y)};
    const startingLoc = this.server.findNearest({pos: startingLocFirstAttempt, range: 6}, true,
      (tile) => {
        if (!tile.item) return true;
        return false;
      });
    if (!startingLoc) return;

    this.server.setItem(Utils.ItemLocation.World(startingLoc), item);
    this.server.clearItem(opts.location);

    const kick = {
      item,
      pos: startingLoc,
      posFloating: {...startingLoc},
      dir,
      momentum: Math.ceil(Utils.dist(startingLoc, opts.to.pos)),
    };
    this.activeKicks.push(kick);

    // Fetch!
    // TODO: a player should have a list of tamed creatures.
    const tamedCreatures = [...this.server.context.creatures.values()]
      .filter((c) => c.tamedBy === opts.playerConnection.player.id);
    const server = this.server;
    const goal: Goal = {
      desiredEffect: 'fetch',
      priority: 1_000,
      satisfied() {
        const state = creatureToFetchState.get(this.creature);
        return !state || state.done;
      },
      onDone() {
        const state = creatureToFetchState.get(this.creature);
        if (!state || !state.hasItem) return;

        const pos = server.findNearestWalkableTile({pos: this.creature.pos, range: 10}) || this.creature.pos;
        server.addItemNear(pos, state.hasItem);
      },
    };
    for (const creature of tamedCreatures) {
      if (Utils.maxDiff(creature.pos, opts.playerConnection.creature.pos) > 20) {
        continue;
      }
      if (creatureToFetchState.has(creature)) continue;

      const creatureState = this.server.creatureStates[creature.id];
      creatureToFetchState.set(creature, {done: false, kick});

      creatureState.learnAction(FetchAction);
      creatureState.addGoal(goal);
    }
  }
}
