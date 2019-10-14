import { Container, DisplayObject, Graphics, Text } from 'pixi.js';
import GridContainer from './grid-container';

interface Tab {
  name: string;
  contents: DisplayObject;
  willShow?: () => void;
  wasHidden?: () => void;
}

class TabContainer extends Container {
  private _tabs = new Map<string, Tab>();
  private _currentTab?: Tab;

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
      gfx.on('pointerdown', () => this.showTab(tabName));
      tabs.addChild(gfx);
    }
    tabs.layout();
    this.addChild(tabs);

    this._currentTab.contents.y = tabs.height + 5;
    this.addChild(this._currentTab.contents);
  }
}

export default TabContainer;
