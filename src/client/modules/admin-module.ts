import Scrollbox from 'pixi-scrollbox';
import { Container, DisplayObject, Graphics, Sprite, Text } from 'pixi.js';
import { getMetaItems } from '../../content';
import ClientModule from '../client-module';
import { getTexture, makeDraggableWindow, makeItemSprite } from '../draw';

class GridContainer extends Container {
  constructor(public maxWidth: number, public padding: number = 0) {
    super();
  }

  public layout() {
    let nextX = 0;
    let nextY = 0;
    let maxHeightOfRow = 0;
    for (const child of this.children) {
      const {width: childWidth, height: childHeight} = child.getLocalBounds();
      if (nextX + childWidth <= this.maxWidth) {
        maxHeightOfRow = Math.max(maxHeightOfRow, childHeight);
      } else {
        nextX = 0;
        nextY += maxHeightOfRow;
      }

      child.x = nextX;
      child.y = nextY;
      nextX += childWidth + this.padding;
    }
  }
}

interface Tab {
  name: string;
  contents: DisplayObject;
  willShow?: () => void;
  wasHidden?: () => void;
}

class TabContainer extends Container {
  private _tabs = new Map<string, Tab>();
  private _currentTab: Tab;

  public add(tab: Tab) {
    this._tabs.set(tab.name, tab);
  }

  public showTab(tabName: string) {
    if (this._currentTab && this._currentTab.name === tabName) return;
    const tab = this._tabs.get(tabName);
    if (!tab) return;
    if (this._currentTab && this._currentTab.wasHidden) this._currentTab.wasHidden();
    this._currentTab = tab;
    if (this._currentTab && this._currentTab.willShow) this._currentTab.willShow();
    this.layout();
  }

  public layout() {
    if (!this._currentTab) {
      this.showTab(this._tabs.keys().next().value);
      return;
    }

    this.removeChildren();
    const tabs = new GridContainer(320);
    for (const tabName of this._tabs.keys()) {
      const gfx = new Graphics();
      const text = new Text(tabName);
      gfx.beginFill(tabName === this._currentTab.name ? 0xBDBDBD : 0xffffff);
      gfx.drawRect(0, 0, text.width, text.height);
      gfx.endFill();
      gfx.addChild(text);
      gfx.interactive = true;
      gfx.on('click', () => this.showTab(tabName));
      tabs.addChild(gfx);
    }
    tabs.layout();
    this.addChild(tabs);

    this._currentTab.contents.y = tabs.height;
    this.addChild(this._currentTab.contents);
  }
}

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
