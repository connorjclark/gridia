import ClientModule from '../client-module';
import * as Utils from '../../utils';
import * as Helper from '../helper';
import * as Content from '../../content';
import { SECTOR_SIZE } from '../../constants';

class MapModule extends ClientModule {
  private mapEl?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private mapWindow = this.game.makeUIWindow({name: 'map', cell: 'map'});

  private nextDrawAt = 0;
  private numDraws = 0;

  onStart() {
    this.mapWindow.classList.add('ui-map');
    this.mapEl = Helper.createChildOf(this.mapWindow, 'canvas', 'map');
    this.mapEl.width = this.mapEl.height; // TODO: css?
    Helper.createChildOf(this.mapWindow, 'div', 'location');

    const context = this.mapEl.getContext('2d');
    if (!context) throw new Error('could not make context');

    this.context = context;

    this.game.client.eventEmitter.on('playerMove', () => {
      this.game.worldContainer.forEachInCamera((_, loc) => {
        this.game.client.player.tilesSeenLog.markSeen(this.game.client.context.map, loc);
      });
    });
  }

  onTick(now: number) {
    const playerLoc = this.game.getPlayerPosition();
    Helper.find('.location', this.mapWindow).innerText =
      `${playerLoc.x}, ${playerLoc.y}, ${playerLoc.z} (map ${playerLoc.w})`;

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
        const loc = { ...playerLoc, x: x + startX, y: y + startY };
        if (!partition.inBounds(loc)) continue;

        const sector = partition.getSectorIfLoaded(Utils.worldToSector(loc, SECTOR_SIZE));
        if (!sector) continue;

        const mark = this.game.client.player.tilesSeenLog.getMark(this.game.client.context.map, loc);
        if (!mark) continue;

        const { floor, walkable } = mark;

        let color;
        if (!walkable) {
          color = 'black';
        } else {
          color = '#' + floors[floor].color;
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

export default MapModule;
