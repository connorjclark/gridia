import Scrollbox from 'pixi-scrollbox';
import { DisplayObject, Graphics, Sprite } from 'pixi.js';
import { getFloors, getMetaItems } from '../../content';
import { equalItems } from '../../utils';
import ClientModule from '../client-module';
import { getTexture, makeDraggableWindow, makeItemSprite } from '../draw';
import GridContainer from '../pixi/grid-container';
import TabContainer from '../pixi/tab-container';

class AdminClientModule extends ClientModule {
  private _adminWindow: ReturnType<typeof makeDraggableWindow>;
  private _selectedContent: {displayObject: DisplayObject; type: string; id: number; } | null;

  public onStart() {
    // const panel = Helper.find('.panel--admin');

    this.game.client.eventEmitter.on('panelFocusChanged', ({ panelName }) => {
      if (panelName === 'admin') {
        this.game.addWindow(this.getAdminWindow());
      } else if (this._adminWindow) {
        this.game.removeWindow(this._adminWindow);
        if (this._selectedContent) {
          (this._selectedContent.displayObject as Sprite).removeChildren();
        }
        this._selectedContent = null;
      }
    });
  }

  // TODO: there are issues with Scrollbox:
  // 1) dragging the scroll bar doesn't work great (it moves too slowly)
  // 2) clicking above where the scrollbar is jumps to that position, but clicking below does nothing
  private getAdminWindow() {
    if (this._adminWindow) return this._adminWindow;

    const tabs = new TabContainer();

    const makeGrid = (contentData: Array<[number, DisplayObject]>) => {
      const displayObjectToMetaIdMap = new WeakMap<DisplayObject, number>();
      const scrollbox = new Scrollbox({boxWidth: 320, boxHeight: 320, scrollbarOffsetVertical: 10});
      const grid = new GridContainer(320);
      scrollbox.content.addChild(grid);
      for (const [id, displayObject] of contentData) {
        displayObjectToMetaIdMap.set(displayObject, id);
        displayObject.interactive = true;
        grid.addChild(displayObject);
      }
      grid.layout();
      scrollbox.update();
      return {scrollbox, displayObjectToMetaIdMap};
    };

    interface MakeContentSelectionTabOpts {
      name: string;
      scrollbox: Scrollbox;
      displayObjectToMetaIdMap: WeakMap<DisplayObject, number>;
    }
    const makeContentSelectionTab = ({ name, scrollbox, displayObjectToMetaIdMap }: MakeContentSelectionTabOpts) => {
      tabs.add({
        name,
        contents: scrollbox,
        // https://github.com/davidfig/pixi-viewport/issues/150
        willShow: () => scrollbox.content.pause = false,
        wasHidden: () => scrollbox.content.pause = true,
      });

      scrollbox.content.pause = true;
      scrollbox.interactive = true;
      scrollbox.on('click', (e: PIXI.interaction.InteractionEvent) => {
        const id = displayObjectToMetaIdMap.get(e.target);
        if (id === undefined) return;
        if (this._selectedContent) {
          (this._selectedContent.displayObject as Sprite).removeChildren();
        }
        if (this._selectedContent && this._selectedContent.displayObject === e.target) {
          // Unselect.
          this._selectedContent = null;
        } else {
          this._selectedContent = {displayObject: e.target, type: name, id};
          (e.target as Sprite).addChild(new Graphics().lineStyle(2, 0xFFFF00).drawRect(0, 0, 32, 32));
        }
      });
    };

    makeContentSelectionTab({
      name: 'Items',
      ...makeGrid(
        getMetaItems().filter(Boolean).map((meta) => [meta.id, makeItemSprite({type: meta.id, quantity: 1})])),
    });

    makeContentSelectionTab({
      name: 'Floors',
      ...makeGrid(getFloors().map((id) => [id, new PIXI.Sprite(getTexture.floors(id))])),
    });

    const adminWindow = makeDraggableWindow();
    adminWindow.contents.addChild(tabs);
    tabs.layout();

    // TODO: unregister when tab not active.
    const handler = (loc: TilePoint) => {
      if (!this._selectedContent) return;
      if (this.game.state.mouse.state !== 'down') return;

      if (this._selectedContent.type === 'Items') {
        const item = this._selectedContent.id > 0 ? {type: this._selectedContent.id, quantity: 1} : undefined;
        const currentItem = this.game.client.context.map.getItem(loc);
        if (equalItems(currentItem, item)) return;
        // Don't overwrite existing items - must explictly select the "null" item to delete items.
        if (currentItem && item) return;
        this.game.client.wire.send('adminSetItem', {
          ...loc,
          item,
        });
        // Set immeditely in client, b/c server will take a while to respond and this prevents sending multiple
        // messages for the same tile.
        this.game.client.context.map.getTile(loc).item = item;
      } else if (this._selectedContent.type === 'Floors') {
        const floor = this._selectedContent.id;
        if (this.game.client.context.map.getTile(loc).floor === floor) return;
        this.game.client.wire.send('adminSetFloor', {
          ...loc,
          floor,
        });
        this.game.client.context.map.getTile(loc).floor = floor;
      }
    };
    this.game.client.eventEmitter.on('MouseMovedOverTile', handler);
    this.game.client.eventEmitter.on('TileClicked', handler);

    this._adminWindow = adminWindow;
    return adminWindow;
  }
}

export default AdminClientModule;
