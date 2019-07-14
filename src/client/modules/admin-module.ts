import Scrollbox from 'pixi-scrollbox';
import { getMetaItems } from '../../content';
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

    {
      const scrollbox = new Scrollbox({boxWidth: 320, boxHeight: 320, scrollbarOffsetVertical: 10});
      const grid = new GridContainer(320);
      scrollbox.content.addChild(grid);
      for (const meta of getMetaItems()) {
        if (!meta) continue;
        const sprite = makeItemSprite({type: meta.id, quantity: 1});
        grid.addChild(sprite);
      }
      grid.layout();
      scrollbox.update();
      tabs.add({
        name: 'Items',
        contents: scrollbox,
        // https://github.com/davidfig/pixi-viewport/issues/150
        willShow: () => scrollbox.content.pause = false,
        wasHidden: () => scrollbox.content.pause = true,
      });
    }

    {
      const scrollbox = new Scrollbox({boxWidth: 320, boxHeight: 320, scrollbarOffsetVertical: 10});
      const grid = new GridContainer(320);
      scrollbox.content.addChild(grid);
      for (let i = 0; i < 600; i++) {
        const sprite = new PIXI.Sprite(getTexture.floors(i));
        grid.addChild(sprite);
      }
      grid.layout();
      scrollbox.update();
      tabs.add({
        name: 'Floors',
        contents: scrollbox,
        willShow: () => scrollbox.content.pause = false,
        wasHidden: () => scrollbox.content.pause = true,
      });
    }

    const adminWindow = makeDraggableWindow();
    adminWindow.contents.addChild(tabs);
    tabs.layout();

    this._adminWindow = adminWindow;
    return adminWindow;
  }
}

export default AdminClientModule;
