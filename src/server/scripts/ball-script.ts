import * as Content from '../../content.js';
import * as Utils from '../../utils.js';
import {PlayerConnection} from '../client-connection.js';
import {Script} from '../script.js';
import {Server} from '../server.js';

export class BallScript extends Script<{}> {
  private activeKicks: Array<{item: Item; loc: Point4; locFloating: Point4; dir: Point2; momentum: number}> = [];

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

          const ballDestX = kick.locFloating.x + Utils.clamp(kick.dir.x, -1, 1);
          const ballDestY = kick.locFloating.y + Utils.clamp(kick.dir.y, -1, 1);
          const newLocFloating = {...kick.loc, x: ballDestX, y: ballDestY};
          const newLoc = {...kick.loc, x: Math.round(ballDestX), y: Math.round(ballDestY)};
          const itemAtNewLoc = !Utils.equalPoints(kick.loc, newLoc) && this.server.context.map.getItem(newLoc);

          if (itemAtNewLoc && Content.getMetaItem(itemAtNewLoc.type).class === 'Goal') {
            this.server.setItemInWorld(kick.loc, undefined);
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
            this.server.setItemInWorld(kick.loc, undefined);
            this.server.setItemInWorld(newLoc, kick.item);
            kick.loc = newLoc;
            kick.locFloating = newLocFloating;
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
        loc: opts.to,
        locFloating: {...opts.to},
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
    const dir = Utils.direction(throwerLoc, opts.to.loc);

    const startingLocFirstAttempt =
      {...throwerLoc, x: throwerLoc.x + Math.sign(dir.x), y: throwerLoc.y + Math.sign(dir.y)};
    const startingLoc = this.server.findNearest(startingLocFirstAttempt, 6, true,
      (tile) => {
        if (!tile.item) return true;
        return false;
      });
    if (!startingLoc) return;

    this.server.setItem(Utils.ItemLocation.World(startingLoc), item);
    this.server.clearItem(opts.location);

    this.activeKicks.push({
      item,
      loc: startingLoc,
      locFloating: {...startingLoc},
      dir,
      momentum: Math.ceil(Utils.dist(startingLoc, opts.to.loc)),
    });
  }
}
