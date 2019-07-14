import Scrollbox from 'pixi-scrollbox';
import { DisplayObject, Graphics, Sprite } from 'pixi.js';
import { getFloors, getMetaItems } from '../../content';
import ClientModule from '../client-module';
import { getTexture, makeDraggableWindow, makeItemSprite } from '../draw';
import GridContainer from '../pixi/grid-container';
import TabContainer from '../pixi/tab-container';

class AdminClientModule extends ClientModule {
  private _adminWindow: ReturnType<typeof makeDraggableWindow>;

  public onStart() {
    // const panel = Helper.find('.panel--admin');

    this.game.client.eventEmitter.on('panelFocusChanged', ({ panelName }) => {
      if (panelName === 'admin') {
        this.game.addWindow(this.getAdminWindow());
      } else if (this._adminWindow) {
        this.game.removeWindow(this._adminWindow);
      }
    });
  }

  // TODO: there are issues with Scrollbox:
  // 1) dragging the scroll bar doesn't work great (it moves too slowly)
  // 2) clicking above where the scrollbar is jumps to that position, but clicking below does nothing
  private getAdminWindow() {
    if (this._adminWindow) return this._adminWindow;

    const tabs = new TabContainer();
    let selectedContent: {displayObject: DisplayObject; type: string; id: number; } | null;

    function makeGrid(contentData: Array<[number, DisplayObject]>) {
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
    }

    interface MakeContentSelectionTabOpts {
      name: string;
      scrollbox: Scrollbox;
      displayObjectToMetaIdMap: WeakMap<DisplayObject, number>;
    }
    function makeContentSelectionTab({ name, scrollbox, displayObjectToMetaIdMap }: MakeContentSelectionTabOpts) {
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
        if (selectedContent) {
          (selectedContent.displayObject as Sprite).removeChildren();
        }
        if (selectedContent && selectedContent.displayObject === e.target) {
          // Unselect.
          selectedContent = null;
        } else {
          selectedContent = {displayObject: e.target, type: name, id};
          (e.target as Sprite).addChild(new Graphics().lineStyle(2, 0xFFFF00).drawRect(0, 0, 32, 32));
        }
      });
    }

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

    this.game.client.eventEmitter.on('TileClicked', (loc: TilePoint) => {
      if (!selectedContent) return;

      if (selectedContent.type === 'Items') {
        const item = selectedContent.id !== undefined ? {type: selectedContent.id, quantity: 1} : undefined;
        this.game.client.wire.send('adminSetItem', {
          ...loc,
          item,
        });
      } else if (selectedContent.type === 'Floors') {
        const floor = selectedContent.id;
        this.game.client.wire.send('adminSetFloor', {
          ...loc,
          floor,
        });
      }
    });

    this._adminWindow = adminWindow;
    return adminWindow;
  }
}

export default AdminClientModule;
