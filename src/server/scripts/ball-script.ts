import * as Content from '../../content.js';
import * as Utils from '../../utils.js';
import {ClientConnection} from '../client-connection.js';
import {Script} from '../script.js';
import {Server} from '../server.js';

export class BallScript extends Script<{}> {
  private activeKicks: Array<{item: Item; loc: Point4; dir: Point2; momentum: number}> = [];

  constructor(protected server: Server) {
    super('ball', server, {});
  }

  onStart() {
    this.server.taskRunner.registerTickSection({
      description: 'ball script',
      rate: {ms: 100},
      fn: () => {
        for (let i = this.activeKicks.length - 1; i >= 0; i-- ) {
          const kick = this.activeKicks[i];

          const ballDestX = kick.loc.x + Math.round(Utils.clamp(kick.dir.x, -1, 1));
          const ballDestY = kick.loc.y + Math.round(Utils.clamp(kick.dir.y, -1, 1));
          const newLoc = {...kick.loc, x: ballDestX, y: ballDestY};
          const itemAtNewLoc = this.server.context.map.getItem(newLoc);

          if (itemAtNewLoc && Content.getMetaItem(itemAtNewLoc.type).class === 'Goal') {
            this.server.setItem(kick.loc, undefined);
            this.server.setItem(newLoc, {type: itemAtNewLoc.type + 1, quantity: 1});
            kick.momentum = 0;
          } else if (itemAtNewLoc) {
            if (kick.dir.x && kick.dir.y) {
              kick.dir.y *= -1;
            } else {
              kick.dir.x *= -1;
              kick.dir.y *= -1;
            }
          } else {
            this.server.setItem(kick.loc, undefined);
            this.server.setItem(newLoc, kick.item);
            kick.loc = newLoc;
          }

          kick.momentum -= 1;
          if (kick.momentum <= 0) this.activeKicks.splice(i, 1);
        }
      },
    });
  }

  onPlayerMove(opts: {clientConnection: ClientConnection; from: Point4; to: Point4}) {
    const item = this.server.context.map.getItem(opts.to);
    if (!item || Content.getMetaItem(item.type).class !== 'Ball') return;
    if (this.activeKicks.some((kick) => kick.item === item)) return;

    // TODO ... support kicking ball already in motion. Results in cloning ...
    // const indexOfActiveKick = this.activeKicks.findIndex((kick) => kick.item === item);
    // if (indexOfActiveKick !== -1) {
    //   this.activeKicks.slice(indexOfActiveKick, 1);
    // }

    const dir = Utils.direction(opts.from, opts.to);
    this.activeKicks.push({
      item,
      loc: opts.to,
      dir,
      momentum: 5,
    });
  }
}
