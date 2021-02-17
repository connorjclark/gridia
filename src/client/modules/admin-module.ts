import { GFX_SIZE } from '../../constants';
import { getFloors, getMetaItem, getMetaItems } from '../../content';
import * as ProtocolBuilder from '../../protocol/client-to-server-protocol-builder';
import * as Utils from '../../utils';
import ClientModule from '../client-module';
import { getTexture, GridiaWindow, makeItemSprite } from '../draw';
import GridContainer from '../pixi/grid-container';
import TabContainer from '../pixi/tab-container';
import { makeWindow } from '../ui/admin-window';

interface SelectedContent {
  displayObject?: PIXI.DisplayObject; // TODO remove
  type: 'Items' | 'Floors';
  id: number;
}

class AdminModule extends ClientModule {
  private _adminWindow?: GridiaWindow;
  private _adminWindowV2?: HTMLElement;
  private _selectedContent?: SelectedContent;

  onStart() {
    // const panel = Helper.find('.panel--admin');

    this.game.client.eventEmitter.on('panelFocusChanged', async ({ panelName }) => {
      if (panelName === 'admin') {
        await this.init();

        // TODO: delete v1.
        const useV2 = !false;
        if (useV2) {
          this.getAdminWindowV2();
          if (this._adminWindowV2) this._adminWindowV2.hidden = false;
        } else {
          this.game.addWindow(this.getAdminWindow());
        }
      } else if (this._adminWindow || this._adminWindowV2) {
        if (this._adminWindow) this.game.removeWindow(this._adminWindow);
        if (this._adminWindowV2) this._adminWindowV2.hidden = true;
        if (this._selectedContent && this._selectedContent.displayObject) {
          (this._selectedContent.displayObject as PIXI.Sprite).removeChildren();
        }
        this.setSelectedContent(undefined);
      }
    });
  }

  setSelectedContent(selectedContent?: SelectedContent) {
    if (this._selectedContent && !selectedContent) {
      this.game.client.eventEmitter.emit('editingMode', {enabled: false});
    } else if (!this._selectedContent && selectedContent) {
      this.game.client.eventEmitter.emit('editingMode', {enabled: true});
    }

    this._selectedContent = selectedContent;
  }

  private async init() {
    if (this._adminWindow || this._adminWindowV2) return;

    // Must first load all the image resources.
    await this.game.loader.loadAllImageResources();

    const handler = (loc: TilePoint) => {
      if (!this._selectedContent) return;
      if (this.game.state.mouse.state !== 'down') return;

      if (this._selectedContent.type === 'Items') {
        const item = this._selectedContent.id > 0 ? {type: this._selectedContent.id, quantity: 1} : undefined;
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
      } else if (this._selectedContent.type === 'Floors') {
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


  private getAdminWindowV2(): HTMLElement {
    if (this._adminWindowV2) return this._adminWindowV2;
    this._adminWindowV2 = makeWindow(this);
    return this._adminWindowV2;
  }

  // TODO: there are issues with Scrollbox:
  // 1) dragging the scroll bar doesn't work great (it moves too slowly)
  // 2) clicking above where the scrollbar is jumps to that position, but clicking below does nothing
  private getAdminWindow(): GridiaWindow {
    if (this._adminWindow) return this._adminWindow;

    const tabs = new TabContainer();

    const makeGrid = (contentData: Array<[number, PIXI.Sprite]>) => {
      const displayObjectToMetaIdMap = new Map<PIXI.DisplayObject, number>();
      const scrollbox =
        new PIXI.Scrollbox({boxWidth: 320, boxHeight: 320, scrollbarOffsetVertical: 10, overflowX: 'none'});
      const grid = new GridContainer(320);
      scrollbox.content.addChild(grid);
      for (const [id, displayObject] of contentData) {
        displayObjectToMetaIdMap.set(displayObject, id);
        displayObject.interactive = true;
        grid.addChild(displayObject);
      }
      grid.layout();
      scrollbox.update();

      const setVisibility = (filter: (id: number) => boolean) => {
        for (const displayObject of grid.children) {
          const id = displayObjectToMetaIdMap.get(displayObject);
          displayObject.visible = id ? filter(id) : true;
        }
        grid.layout();
        scrollbox.update();
      };

      return {scrollbox, displayObjectToMetaIdMap, setVisibility};
    };

    interface MakeContentSelectionTabOpts {
      name: string;
      scrollbox: any;
      displayObjectToMetaIdMap: Map<PIXI.DisplayObject, number>;
      setVisibility: (filter: (id: number) => boolean) => void;
    }
    const makeContentSelectionTab = ({ name, scrollbox, displayObjectToMetaIdMap,
      setVisibility }: MakeContentSelectionTabOpts) => {
      let contents = scrollbox;

      // Add a text input filter to the tab contents.
      if (name === 'Items') {
        setVisibility((id) => id % 2 === 0);
        contents = new PIXI.Container();
        const input = new PIXI.TextInput({
          input: {
            fontSize: '25pt',
            padding: '14px',
            width: scrollbox.width + 'px',
            color: '#FFFFFF',
          },
        });
        input.placeholder = 'search for item ...';
        contents.addChild(input);
        contents.addChild(scrollbox).y = input.height;

        input.on('input', (text) => {
          const re = new RegExp(text, 'i');
          setVisibility((id) => {
            const meta = getMetaItem(id);

            if (id === 0) return true;
            if (meta.name.match(re)) return true;
            if (meta.class && meta.class.match(re)) return true;

            return false;
          });
        });
      }

      tabs.add({
        name,
        contents,
        // https://github.com/davidfig/pixi-viewport/issues/150
        willShow: () => scrollbox.content.pause = false,
        wasHidden: () => scrollbox.content.pause = true,
      });

      scrollbox.content.pause = true;
      scrollbox.interactive = true;
      scrollbox.on('click', (e: PIXI.InteractionEvent) => {
        // TODO: v5 broke this
        // const target = e.target;
        // const id = displayObjectToMetaIdMap.get(target);

        const pos1 = e.data.getLocalPosition(scrollbox.content);
        let id;
        let target;
        for (const [displayObject, _id] of displayObjectToMetaIdMap.entries()) {
          if (!displayObject.visible) continue;
          const pos2 = {x: displayObject.x, y: displayObject.y};
          const bounds = displayObject.getBounds();
          if (pos1.x >= pos2.x && pos1.x < pos2.x + bounds.width &&
              pos1.y >= pos2.y && pos1.y < pos2.y + bounds.height) {
            id = _id;
            target = displayObject;
            break;
          }
        }

        if (id === undefined) return;
        if (this._selectedContent) {
          (this._selectedContent.displayObject as PIXI.Sprite).removeChildren();
        }
        if (this._selectedContent && this._selectedContent.displayObject === target) {
          // Unselect.
          this.setSelectedContent(undefined);
        } else if (target) {
          // @ts-ignore
          this.setSelectedContent({displayObject: target, type: name, id});
          (target as PIXI.Sprite)
            .addChild(
              new PIXI.Graphics().lineStyle(2, 0xFFFF00).drawRect(0, 0, GFX_SIZE, GFX_SIZE),
            );
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
      ...makeGrid(getFloors().map((floor) => [floor.id, new PIXI.Sprite(getTexture.floors(floor.id))])),
    });

    const adminWindow = new GridiaWindow();
    adminWindow.contents.addChild(tabs);
    tabs.layout();

    this._adminWindow = adminWindow;
    return adminWindow;
  }
}

export default AdminModule;
