import * as Player from '../../player.js';
import {ClientModule} from '../client-module.js';
import {makeMapWindow} from '../ui/map-window.js';

export class MapModule extends ClientModule {
  protected mapWindow?: ReturnType<typeof makeMapWindow>;

  getMapWindow() {
    if (this.mapWindow) return this.mapWindow;

    this.mapWindow = makeMapWindow(this.game, {pos: this.game.client.creature.pos, time: ''});
    return this.mapWindow;
  }

  onStart() {
    this.getMapWindow();

    this.game.client.eventEmitter.on('playerMove', () => {
      this.game.worldContainer.forEachInCamera((_, pos) => {
        Player.markTileSeen(this.game.client.player, this.game.client.context.map, pos);
      });
    });

    setInterval(() => {
      if (!this.game.client.context.map.partitions.get(this.game.client.creature.pos.w)) return;

      this.getMapWindow().actions.setPos({...this.game.client.creature.pos});
    }, 50);
  }
}
