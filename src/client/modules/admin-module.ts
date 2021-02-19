import * as ProtocolBuilder from '../../protocol/client-to-server-protocol-builder';
import * as Utils from '../../utils';
import ClientModule from '../client-module';
import { makeAdminWindow } from '../ui/admin-window';

interface SelectedContent {
  type: 'items' | 'floors';
  id: number;
}

class AdminModule extends ClientModule {
  private _adminWindow?: HTMLElement;
  private _selectedContent?: SelectedContent;

  onStart() {
    this.game.client.eventEmitter.on('panelFocusChanged', async ({ panelName }) => {
      if (panelName === 'admin') {
        await this.init();
        this.getAdminWindow().hidden = false;
        this.game.worldContainer.camera.centerElasticity = this.game.worldContainer.camera.RIGHT_CENTER_ELASTICITY;
      } else if (this._adminWindow) {
        this.setSelectedContent(undefined);
        this._adminWindow.hidden = true;
        this.game.worldContainer.camera.centerElasticity = this.game.worldContainer.camera.DEFAULT_CENTER_ELASTICITY;
      }
    });
  }

  setSelectedContent(selectedContent?: SelectedContent) {
    if (this._selectedContent && !selectedContent) {
      this.game.client.eventEmitter.emit('editingMode', { enabled: false });
    } else if (!this._selectedContent && selectedContent) {
      this.game.client.eventEmitter.emit('editingMode', { enabled: true });
    }

    this._selectedContent = selectedContent;
  }

  private async init() {
    if (this._adminWindow) return;

    // Must first load all the image resources.
    await this.game.loader.loadAllImageResources();

    const handler = (loc: TilePoint) => {
      if (!this._selectedContent) return;
      if (this.game.state.mouse.state !== 'down') return;

      if (this._selectedContent.type === 'items') {
        const item = this._selectedContent.id > 0 ? { type: this._selectedContent.id, quantity: 1 } : undefined;
        const currentItem = this.game.client.context.map.getItem(loc);
        if (Utils.equalItems(currentItem, item)) return;
        // Don't overwrite existing items - must explictly select the "null" item to delete items.
        if (currentItem && item) return;
        this.game.client.connection.send(ProtocolBuilder.adminSetItem({
          ...loc,
          item,
        }));
        // Set immeditely in client, b/c server will take a while to respond and this prevents sending multiple
        // messages for the same tile.
        this.game.client.context.map.getTile(loc).item = item;
      } else if (this._selectedContent.type === 'floors') {
        const floor = this._selectedContent.id;
        if (this.game.client.context.map.getTile(loc).floor === floor) return;
        this.game.client.connection.send(ProtocolBuilder.adminSetFloor({
          ...loc,
          floor,
        }));
        this.game.client.context.map.getTile(loc).floor = floor;
      }
    };
    this.game.client.eventEmitter.on('mouseMovedOverTile', handler);
    this.game.client.eventEmitter.on('tileClicked', handler);
  }

  private getAdminWindow() {
    if (this._adminWindow) return this._adminWindow;
    this._adminWindow = makeAdminWindow(this);
    return this._adminWindow;
  }
}

export default AdminModule;
