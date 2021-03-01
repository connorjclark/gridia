import * as ProtocolBuilder from '../../protocol/client-to-server-protocol-builder';
import * as Utils from '../../utils';
import ClientModule from '../client-module';
import { makeAdminWindow, State } from '../ui/admin-window';

class AdminModule extends ClientModule {
  private _adminWindow?: HTMLElement;
  private _state?: State;

  onStart() {
    this.game.client.eventEmitter.on('panelFocusChanged', async ({ panelName }) => {
      if (panelName === 'admin') {
        await this.init();
        this.getAdminWindow().hidden = false;
        this.game.worldContainer.camera.centerElasticity = this.game.worldContainer.camera.RIGHT_CENTER_ELASTICITY;
      } else if (this._adminWindow) {
        this.setUIState(undefined);
        this._adminWindow.hidden = true;
        this.game.worldContainer.camera.centerElasticity = this.game.worldContainer.camera.DEFAULT_CENTER_ELASTICITY;
      }
    });
  }

  setUIState(state?: State) {
    if (this._state && !state) {
      this.game.client.eventEmitter.emit('editingMode', { enabled: false });
    } else if (!this._state && state) {
      this.game.client.eventEmitter.emit('editingMode', { enabled: true });
    }

    this._state = state;
  }

  private async init() {
    if (this._adminWindow) return;

    // Must first load all the image resources.
    await this.game.loader.loadAllImageResources();

    let downAt: Point4 | undefined;
    this.game.client.eventEmitter.on('pointerDown', (loc) => {
      if (!this._state) return;

      downAt = loc;
      if (this._state.tool === 'point') {
        this.setTile(loc);
      }
    });
    this.game.client.eventEmitter.on('pointerMove', (loc) => {
      if (!this._state || !this._state.selected || !downAt) return;

      if (this._state.tool === 'point') {
        this.setTile(loc);
      }
    });
    this.game.client.eventEmitter.on('pointerUp', (loc) => {
      if (downAt && this._state?.tool === 'rectangle') {
        const minx = Math.min(downAt.x, loc.x);
        const maxx = Math.max(downAt.x, loc.x);
        const miny = Math.min(downAt.y, loc.y);
        const maxy = Math.max(downAt.y, loc.y);
        for (let x = minx; x <= maxx; x++) {
          for (let y = miny; y <= maxy; y++) {
            this.setTile({x, y, w: loc.w, z: loc.z});
          }
        }
      }

      downAt = undefined;
    });
  }

  private setTile(loc: Point4) {
    if (!this._state?.selected) return;

    if (this._state.selected.type === 'item') {
      const item = this._state.selected.id > 0 ? { type: this._state.selected.id, quantity: 1 } : undefined;
      const currentItem = this.game.client.context.map.getItem(loc);
      if (Utils.equalItems(currentItem, item)) return;

      // Don't overwrite existing items - must explictly select the "null" item to delete items.
      if (this._state.safeMode && currentItem && item) return;

      this.game.client.connection.send(ProtocolBuilder.adminSetItem({
        ...loc,
        item,
      }));
      // Set immeditely in client, b/c server will take a while to respond and this prevents sending multiple
      // messages for the same tile.
      // TODO: seems like a bad idea.
      this.game.client.context.map.getTile(loc).item = item;
    } else if (this._state.selected.type === 'floor') {
      const floor = this._state.selected.id;
      if (this.game.client.context.map.getTile(loc).floor === floor) return;
      this.game.client.connection.send(ProtocolBuilder.adminSetFloor({
        ...loc,
        floor,
      }));
      this.game.client.context.map.getTile(loc).floor = floor;
    }
  }

  private getAdminWindow() {
    if (this._adminWindow) return this._adminWindow;
    this._adminWindow = makeAdminWindow(this);
    return this._adminWindow;
  }
}

export default AdminModule;
