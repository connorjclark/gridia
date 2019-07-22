import Scrollbox from 'pixi-scrollbox';
import { Container, DisplayObject, Graphics, Sprite } from 'pixi.js';
import { getFloors, getMetaItem, getMetaItems } from '../../content';
import * as ProtocolBuilder from '../../protocol/client-to-server-protocol-builder';
import { equalItems } from '../../utils';
import ClientModule from '../client-module';
import { getTexture, makeDraggableWindow, makeItemSprite } from '../draw';
import GridContainer from '../pixi/grid-container';
import TabContainer from '../pixi/tab-container';

// This attaches to PIXI namespace: PIXI.TextInput :(
require('pixi-text-input');

interface SelectedContent {
  displayObject: DisplayObject;
  type: string;
  id: number;
}

class AdminClientModule extends ClientModule {
  private _adminWindow: ReturnType<typeof makeDraggableWindow>;
  private _selectedContent: SelectedContent | null;

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
        this.setSelectedContent(null);
      }
    });
  }

  private setSelectedContent(selectedContent: SelectedContent | null) {
    if (Boolean(this._selectedContent) && !Boolean(selectedContent)) {
      this.game.client.eventEmitter.emit('EditingMode', {enabled: false});
    } else if (!Boolean(this._selectedContent) && Boolean(selectedContent)) {
      this.game.client.eventEmitter.emit('EditingMode', {enabled: true});
    }

    this._selectedContent = selectedContent;
  }

  // TODO: there are issues with Scrollbox:
  // 1) dragging the scroll bar doesn't work great (it moves too slowly)
  // 2) clicking above where the scrollbar is jumps to that position, but clicking below does nothing
  private getAdminWindow() {
    if (this._adminWindow) return this._adminWindow;

    const tabs = new TabContainer();

    const makeGrid = (contentData: Array<[number, DisplayObject]>) => {
      const displayObjectToMetaIdMap = new WeakMap<DisplayObject, number>();
      const scrollbox = new Scrollbox({boxWidth: 320, boxHeight: 320, scrollbarOffsetVertical: 10, overflowX: 'none'});
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
          displayObject.visible = filter(id);
        }
        grid.layout();
        scrollbox.update();
      };

      return {scrollbox, displayObjectToMetaIdMap, setVisibility};
    };

    interface MakeContentSelectionTabOpts {
      name: string;
      scrollbox: Scrollbox;
      displayObjectToMetaIdMap: WeakMap<DisplayObject, number>;
      setVisibility: (filter: (id: number) => boolean) => void;
    }
    const makeContentSelectionTab = ({ name, scrollbox, displayObjectToMetaIdMap,
        setVisibility }: MakeContentSelectionTabOpts) => {
      let contents = scrollbox;

      // Add a text input filter to the tab contents.
      if (name === 'Items') {
        setVisibility((id) => id % 2 === 0);
        contents = new Container();
        // @ts-ignore
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

        input.on('input', (text: string) => {
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
      scrollbox.on('click', (e: PIXI.interaction.InteractionEvent) => {
        const id = displayObjectToMetaIdMap.get(e.target);
        if (id === undefined) return;
        if (this._selectedContent) {
          (this._selectedContent.displayObject as Sprite).removeChildren();
        }
        if (this._selectedContent && this._selectedContent.displayObject === e.target) {
          // Unselect.
          this.setSelectedContent(null);
        } else {
          this.setSelectedContent({displayObject: e.target, type: name, id});
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
        this.game.client.wire.send(ProtocolBuilder.adminSetItem({
          ...loc,
          item,
        }));
        // Set immeditely in client, b/c server will take a while to respond and this prevents sending multiple
        // messages for the same tile.
        this.game.client.context.map.getTile(loc).item = item;
      } else if (this._selectedContent.type === 'Floors') {
        const floor = this._selectedContent.id;
        if (this.game.client.context.map.getTile(loc).floor === floor) return;
        this.game.client.wire.send(ProtocolBuilder.adminSetFloor({
          ...loc,
          floor,
        }));
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
