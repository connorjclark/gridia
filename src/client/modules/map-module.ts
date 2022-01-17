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

    const updatePos = () => {
      this.getMapWindow().actions.setPos({...this.game.client.creature.pos});
    };
    const updateTime = () => {
      this.getMapWindow().actions.setTime(this.game.client.worldTime.toString());
    };

    this.game.client.eventEmitter.on('playerMove', () => {
      this.game.worldContainer.forEachInCamera((_, pos) => {
        Player.markTileSeen(this.game.client.player, this.game.client.context.map, pos);
      });

      updatePos();
    });

    setInterval(updateTime, 1000);
    updateTime();
    updatePos();
  }
}
