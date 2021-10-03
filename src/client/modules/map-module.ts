import * as Content from '../../content.js';
import * as Player from '../../player.js';
import {ClientModule} from '../client-module.js';
import * as Helper from '../helper.js';
import {makeUIWindow} from '../ui/ui-common.js';

export class MapModule extends ClientModule {
  private mapEl?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private mapWindow = makeUIWindow({name: 'map', cell: 'map', noscroll: true});

  private nextDrawAt = 0;
  private numDraws = 0;

  onStart() {
    this.mapWindow.classList.add('ui-map', 'flex');
    this.mapEl = Helper.createChildOf(this.mapWindow, 'canvas', 'map');
    this.mapEl.width = this.mapEl.height; // TODO: css?

    const wrapper = Helper.createChildOf(this.mapWindow, 'div');
    Helper.createChildOf(wrapper, 'div', 'location');
    Helper.createChildOf(wrapper, 'div', 'time');

    const context = this.mapEl.getContext('2d');
    if (!context) throw new Error('could not make context');

    this.context = context;

    this.game.client.eventEmitter.on('playerMove', () => {
      this.game.worldContainer.forEachInCamera((_, loc) => {
        Player.markTileSeen(this.game.client.player, this.game.client.context.map, loc);
      });
    });
  }

  onTick(now: number) {
    const playerLoc = this.game.getPlayerPosition();
    Helper.find('.location', this.mapWindow).innerText =
      `${playerLoc.x}, ${playerLoc.y}, ${playerLoc.z} (map ${playerLoc.w})`;

    const worldTime = this.game.worldTime;
    Helper.find('.time', this.mapWindow).innerText = `Time: ${worldTime}`;

    if (now < this.nextDrawAt) return;
    this.nextDrawAt = now + 500;
    this.draw();
    this.numDraws += 1;
  }

  draw() {
    if (!this.context || !this.mapEl) throw new Error('could not make context');

    this.context.fillStyle = 'grey';
    // @ts-ignore
    this.context.fillRect(0, 0, this.mapEl.width, this.mapEl.height);

    const chunk = this.mapEl.width;
    const playerLoc = this.game.getPlayerPosition();
    const partition = this.game.client.context.map.getPartition(playerLoc.w);

    const startX = Math.floor(playerLoc.x / chunk) * chunk;
    const startY = Math.floor(playerLoc.y / chunk) * chunk;
    const floors = Content.getFloors();

    for (let x = 0; x < chunk; x++) {
      for (let y = 0; y < chunk; y++) {
        const loc = {...playerLoc, x: x + startX, y: y + startY};
        if (!partition.inBounds(loc)) continue;

        const mark = Player.getTileSeenData(this.game.client.player, loc);
        if (mark.floor === 0 && !mark.walkable) continue;

        const {floor, walkable} = mark;

        let color;
        if (!walkable) {
          color = 'black';
        } else {
          color = '#' + floors[floor]?.color || '000000';
        }

        this.context.fillStyle = color;
        this.context.fillRect(x, y, 1, 1);
      }
    }

    if (this.numDraws % 2 === 0) {
      this.context.fillStyle = 'red';
      this.context.fillRect(playerLoc.x % chunk - 3, playerLoc.y % chunk - 3, 6, 6);
    }
  }
}
