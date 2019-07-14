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

class TabContainer extends Container {
  private _tabs = new Map<string, DisplayObject>();
  private _currentTab: string;

  public add(tabName: string, contents: DisplayObject) {
    this._tabs.set(tabName, contents);
  }

  public showTab(tabName: string) {
    if (this._currentTab === tabName) return;
    this._currentTab = tabName;
    this.layout();
  }

  public layout() {
    this.removeChildren();

    const currentTab = this._currentTab || this._tabs.keys().next().value;

    const tabs = new GridContainer(320);
    for (const tabName of this._tabs.keys()) {
      const gfx = new Graphics();
      const text = new Text(tabName);
      gfx.beginFill(tabName === currentTab ? 0xBDBDBD : 0xffffff);
      gfx.drawRect(0, 0, text.width, text.height);
      gfx.endFill();
      gfx.addChild(text);
      gfx.interactive = true;
      gfx.on('click', () => this.showTab(tabName));
      tabs.addChild(gfx);
    }
    tabs.layout();
    this.addChild(tabs);

    const tabToShow = this._tabs.get(currentTab);
    tabToShow.y = tabs.height;
    this.addChild(tabToShow);
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
  // 3) the mouse wheel moves all view ports
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
      tabs.add('Items', scrollbox);
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
      tabs.add('Floors', scrollbox);
    }

    const adminWindow = makeDraggableWindow();
    adminWindow.contents.addChild(tabs);
    tabs.layout();

    this._adminWindow = adminWindow;
    return adminWindow;
  }
}

export default AdminClientModule;
