import * as CommandBuilder from '../../protocol/command-builder.js';
import * as Utils from '../../utils.js';
import {ClientModule} from '../client-module.js';
import {makeAdminWindow, State} from '../ui/admin-window.js';
import {hideWindowsInCell, showWindow} from '../ui/ui-common.js';

export class AdminModule extends ClientModule {
  private _adminWindow?: HTMLElement;
  private _state?: State;

  onStart() {
    this.game.client.eventEmitter.on('windowTabSelected', async ({name, active}) => {
      if (name !== 'admin') return;

      if (active) {
        await this.init();
        hideWindowsInCell('right');
        this.getAdminWindow().hidden = false;
      } else if (this._adminWindow) {
        this.setUIState(undefined);
        this._adminWindow.hidden = true;
        showWindow('inventory');
      }
    });
  }

  setUIState(state?: State) {
    if (this._state && !state) {
      this.game.client.eventEmitter.emit('editingMode', {enabled: false});
    } else if (!this._state && state) {
      this.game.client.eventEmitter.emit('editingMode', {enabled: true});
    }

    this._state = state;
  }

  private async init() {
    if (this._adminWindow) return;

    const scripts = await this.game.client.connection.sendCommand(CommandBuilder.requestScripts({}));
    console.log({scripts}); // TODO ?

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
      if (!this.game.client.context.map.inBounds(loc)) {
        downAt = undefined;
        return;
      }

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

      if (this._state?.tool === 'fill') {
        const start = this.game.client.context.map.getTile(loc);
        const seen = new Set<string>();
        const pending = new Set<string>();
        const locsToSet: Point4[] = [];
        const index = (l: Point4) => `${l.x},${l.y}`;
        const add = (l: Point4) => {
          const data = index(l);
          if (seen.has(data)) return;
          seen.add(data);

          if (!this.game.client.context.map.inBounds(l)) return;
          if (!this.game.worldContainer.camera.contains(l)) return;

          const tile = this.game.client.context.map.getTile(l);
          if (tile.item?.type !== start.item?.type) return;
          if (tile.floor !== start.floor) return;

          pending.add(data);
        };

        add(loc);
        while (pending.size) {
          for (const data of pending.values()) {
            pending.delete(data);
            const [x, y] = data.split(',').map(Number);
            const l = {...loc, x, y};
            locsToSet.push(l);

            add({...l, x: x + 1, y});
            add({...l, x: x - 1, y});
            add({...l, x, y: y + 1});
            add({...l, x, y: y - 1});
          }
        }

        for (const l of locsToSet) {
          this.setTile(l);
        }
      }

      downAt = undefined;
    });
  }

  private setTile(loc: Point4) {
    if (!this._state?.selected) return;

    if (this._state.selected.type === 'items') {
      const item = this._state.selected.id > 0 ? {type: this._state.selected.id, quantity: 1} : undefined;
      const currentItem = this.game.client.context.map.getItem(loc);
      if (Utils.equalItems(currentItem, item)) return;

      // Don't overwrite existing items - must explictly select the "null" item to delete items.
      if (this._state.safeMode && currentItem && item) return;

      this.game.client.connection.sendCommand(CommandBuilder.adminSetItem({
        ...loc,
        item,
      }));
      // Set immeditely in client, b/c server will take a while to respond and this prevents sending multiple
      // messages for the same tile.
      // TODO: seems like a bad idea.
      this.game.client.context.map.getTile(loc).item = item;
    } else if (this._state.selected.type === 'floors') {
      const floor = this._state.selected.id;
      if (this.game.client.context.map.getTile(loc).floor === floor) return;
      this.game.client.connection.sendCommand(CommandBuilder.adminSetFloor({
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
