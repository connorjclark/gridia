import * as Content from '../../content.js';
import * as Player from '../../player.js';
import {ClientModule} from '../client-module.js';
import * as Helper from '../helper.js';

/**
 * https://stackoverflow.com/a/69123384/2788187
 *
 * @param color Hex value format: #ffffff or ffffff
 * @param decimal lighten or darken decimal value, example 0.5 to lighten by 50% or 1.5 to darken by 50%.
 */
function shadeColor(color: string, decimal: number): string {
  const base = color.startsWith('#') ? 1 : 0;

  let r = parseInt(color.substring(base, 3), 16);
  let g = parseInt(color.substring(base + 2, 5), 16);
  let b = parseInt(color.substring(base + 4, 7), 16);

  r = Math.round(r / decimal);
  g = Math.round(g / decimal);
  b = Math.round(b / decimal);

  r = (r < 255) ? r : 255;
  g = (g < 255) ? g : 255;
  b = (b < 255) ? b : 255;

  const rr = ((r.toString(16).length === 1) ? `0${r.toString(16)}` : r.toString(16));
  const gg = ((g.toString(16).length === 1) ? `0${g.toString(16)}` : g.toString(16));
  const bb = ((b.toString(16).length === 1) ? `0${b.toString(16)}` : b.toString(16));

  return `#${rr}${gg}${bb}`;
}

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

    const pixelsPerTile = 3;
    const chunkSize = Math.floor(this.mapEl.width / pixelsPerTile);
    const playerLoc = this.game.getPlayerPosition();
    const partition = this.game.client.context.map.getPartition(playerLoc.w);

    const startX = Math.floor(playerLoc.x / chunkSize) * chunkSize;
    const startY = Math.floor(playerLoc.y / chunkSize) * chunkSize;
    const floors = Content.getFloors();

    for (let x = 0; x < chunkSize; x++) {
      for (let y = 0; y < chunkSize; y++) {
        const pos = {...playerLoc, x: x + startX, y: y + startY};
        if (!partition.inBounds(pos)) continue;

        const mark = Player.getTileSeenData(this.game.client.player, pos);
        if (mark.floor === 0 && !mark.walkable) continue;

        const {floor, walkable, elevationGrade} = mark;

        let color;
        if (!walkable) {
          color = '#000000';
        } else {
          color = '#' + floors[floor]?.color || '000000';
        }

        if (elevationGrade > 0) {
          color = shadeColor(color, 0.9);
        } else if (elevationGrade < 0) {
          color = shadeColor(color, 1.1);
        }

        this.context.fillStyle = color;
        this.context.fillRect(x * pixelsPerTile, y * pixelsPerTile, pixelsPerTile, pixelsPerTile);
      }
    }

    if (this.numDraws % 2 === 0) {
      this.context.fillStyle = 'gold';
      const x = ((playerLoc.x % chunkSize) - 3/2) * pixelsPerTile;
      const y = ((playerLoc.y % chunkSize) - 3/2) * pixelsPerTile;
      this.context.fillRect(x, y, pixelsPerTile * 3, pixelsPerTile * 3);
    }
  }
}
