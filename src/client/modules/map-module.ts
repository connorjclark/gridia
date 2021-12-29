import * as Content from '../../content.js';
import * as Player from '../../player.js';
import {ClientModule} from '../client-module.js';
import * as Helper from '../helper.js';

export class MapModule extends ClientModule {
  private mapEl?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private mapWindowEl?: HTMLElement;

  private nextDrawAt = 0;
  private numDraws = 0;

  onStart() {
    this.game.windowManager.createWindow({
      id: 'map',
      tabLabel: 'Map',
      cell: 'right',
      noscroll: true,
      onInit: (el) => {
        this.mapWindowEl = el;
        this.createMapView();
      },
      show: true,
    });
  }

  createMapView() {
    if (!this.mapWindowEl) return;

    this.mapEl = Helper.createChildOf(this.mapWindowEl, 'canvas', 'map');
    this.mapEl.width = this.mapEl.height; // TODO: css?

    const wrapper = Helper.createChildOf(this.mapWindowEl, 'div');
    Helper.createChildOf(wrapper, 'div', 'location');
    Helper.createChildOf(wrapper, 'div', 'time');

    const context = this.mapEl.getContext('2d');
    if (!context) throw new Error('could not make context');

    this.context = context;

    this.game.client.eventEmitter.on('playerMove', () => {
      this.game.worldContainer.forEachInCamera((_, pos) => {
        Player.markTileSeen(this.game.client.player, this.game.client.context.map, pos);
      });
    });
  }

  onTick(now: number) {
    if (!this.mapWindowEl) return;

    const playerLoc = this.game.getPlayerPosition();
    Helper.find('.location', this.mapWindowEl).innerText =
      `${playerLoc.x}, ${playerLoc.y}, ${playerLoc.z} (map ${playerLoc.w})`;

    const worldTime = this.game.client.worldTime;
    Helper.find('.time', this.mapWindowEl).innerText = `Time: ${worldTime}`;

    if (now < this.nextDrawAt) return;
    this.nextDrawAt = now + 500;
    this.draw();
    this.numDraws += 1;
  }

  draw() {
    if (!this.context || !this.mapEl) throw new Error('could not make context');

    this.context.fillStyle = 'grey';
    this.context.fillRect(0, 0, this.mapEl.width, this.mapEl.height);

    const chunk = this.mapEl.width;
    const playerLoc = this.game.getPlayerPosition();
    const partition = this.game.client.context.map.getPartition(playerLoc.w);

    const startX = Math.floor(playerLoc.x / chunk) * chunk;
    const startY = Math.floor(playerLoc.y / chunk) * chunk;
    const floors = Content.getFloors();

    for (let x = 0; x < chunk; x++) {
      for (let y = 0; y < chunk; y++) {
        const pos = {...playerLoc, x: x + startX, y: y + startY};
        if (!partition.inBounds(pos)) continue;

        const mark = Player.getTileSeenData(this.game.client.player, pos);
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
