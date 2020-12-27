import ClientModule from '../client-module';
import * as Utils from '../../utils';
import * as Helper from '../helper';
import * as Content from '../../content';
import { SECTOR_SIZE } from '../../constants';

class MapModule extends ClientModule {
  private panel = Helper.find('.panel--map');
  private mapEl?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;

  private nextDrawAt = 0;
  private numDraws = 0;

  public onStart() {
    this.mapEl = Helper.find('.map', this.panel) as HTMLCanvasElement;
    this.mapEl.width = this.mapEl.height; // TODO: css?

    const context = this.mapEl.getContext('2d');
    if (!context) throw new Error('could not make context');

    this.context = context;
  }

  public onTick(now: number) {
    if (!this.panel.classList.contains('panel--active')) return;

    const playerLoc = this.game.getPlayerPosition();
    Helper.find('.location', this.panel).innerText =
      `${playerLoc.x}, ${playerLoc.y}, ${playerLoc.z} (map ${playerLoc.w})`;

    if (now < this.nextDrawAt) return;
    this.nextDrawAt = now + 500;
    this.draw();
    this.numDraws += 1;
  }

  public draw() {
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

        // TODO: track if tile has been seen.

        const { floor, item } = sector[loc.x % SECTOR_SIZE][loc.y % SECTOR_SIZE];

        let color;
        if (item && !Content.getMetaItem(item.type).walkable) {
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
