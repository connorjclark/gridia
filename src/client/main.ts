import {OutlineFilter} from '@pixi/filter-outline';
import * as PIXI from 'pixi.js';
import { MINE, WATER } from '../constants';
import Container from '../container';
import { getItemUses, getItemUsesForFocus, getItemUsesForProduct, getItemUsesForTool, getMetaItem } from '../items';
import { findPath } from '../path-finding';
import { clamp, equalPoints, worldToTile as _worldToTile } from '../utils';
import Client from './client';
import { connect, openAndConnectToServerInMemory } from './connect-to-server';
import KEYS from './keys';
import { getMineFloor, getWaterFloor } from './template-draw';

let wire: ClientToServerWire;

// pixi-sound needs to load after PIXI. The linter reorders imports in a way
// that breaks that requirement. So require here.
// @ts-ignore - https://github.com/pixijs/pixi-sound/issues/99
const PIXISound: typeof import('pixi-sound') = require('pixi-sound').default;

const client = new Client();
client.PIXI = PIXI;
client.PIXISound = PIXISound;

interface UIState {
  viewport: {
    x: number;
    y: number;
  };
  mouse: {
    x: number;
    y: number;
    tile?: TilePoint;
    downTile?: TilePoint;
    state: string;
  };
  selectedTile?: TilePoint;
  keys: {
    [index: number]: boolean;
  };
  elapsedFrames: number;
  lastMove: number;
  destination: TilePoint | null;
  pathToDestination: TilePoint[];
}

const state: UIState = {
  viewport: {
    x: 0,
    y: 0,
  },
  mouse: {
    x: 0,
    y: 0,
    state: '',
  },
  keys: {},
  elapsedFrames: 0,
  lastMove: performance.now(),
  destination: null,
  pathToDestination: [],
};

// @ts-ignore - for debugging
window.Gridia = {
  client,
  item(itemType: number) {
    console.log(getMetaItem(itemType));
    console.log('tool', getItemUsesForTool(itemType));
    console.log('focus', getItemUsesForFocus(itemType));
    console.log('product', getItemUsesForProduct(itemType));
  },
};

function convertToPixiLoaderEntries(keys: Record<string, string>): Array<{key: string, url: string}> {
  const entries = [];
  for (const [key, url] of Object.entries(keys)) {
    entries.push({key: key.toLowerCase(), url});
  }
  return entries;
}

const ResourceKeys: Record<string, string[]> = {
  creatures: [],
  floors: [],
  items: [],
  templates: [
    './world/templates/templates0.png',
  ],
};

const SfxKeys = {
  beep: './world/sound/sfx/rpgwo/beep.WAV',
  BlowArrow: './world/sound/sfx/rpgwo/BlowArrow.WAV',
  bombtiq: './world/sound/sfx/rpgwo/bombtiq.wav',
  bubble: './world/sound/sfx/rpgwo/bubble.wav',
  burning: './world/sound/sfx/rpgwo/burning.wav',
  CaneSwish: './world/sound/sfx/rpgwo/CaneSwish.wav',
  CarpentryHammer: './world/sound/sfx/rpgwo/CarpentryHammer.wav',
  criket: './world/sound/sfx/rpgwo/criket.wav',
  Crossbow: './world/sound/sfx/rpgwo/Crossbow.wav',
  diescream: './world/sound/sfx/rpgwo/diescream.wav',
  digi_plink: './world/sound/sfx/rcptones/digi_plink.wav',
  door: './world/sound/sfx/rpgwo/door.wav',
  fishing: './world/sound/sfx/rpgwo/fishing.wav',
  harry: './world/sound/sfx/rpgwo/harry.wav',
  havenmayor: './world/sound/sfx/rpgwo/havenmayor.wav',
  heal: './world/sound/sfx/ff6/heal.wav',
  hiccup: './world/sound/sfx/rpgwo/hiccup.wav',
  ice: './world/sound/sfx/rpgwo/ice.WAV',
  pop_drip: './world/sound/sfx/rcptones/pop_drip.wav',
  punch: './world/sound/sfx/rpgwo/punch.wav',
  roll: './world/sound/sfx/zelda/roll.wav',
  Saw: './world/sound/sfx/rpgwo/Saw.wav',
  ShovelDig: './world/sound/sfx/rpgwo/ShovelDig.wav',
  smithinghammer: './world/sound/sfx/rpgwo/smithinghammer.wav',
  sparkly: './world/sound/sfx/rpgwo/sparkly.wav',
  warp: './world/sound/sfx/rpgwo/warp.wav',
  woodcutting: './world/sound/sfx/ryanconway/woodcutting.wav',
};

for (let i = 0; i < 8; i++) {
  ResourceKeys.creatures.push(`./world/player/player${i}.png`);
}
for (let i = 0; i < 6; i++) {
  ResourceKeys.floors.push(`./world/floors/floors${i}.png`);
}
for (let i = 0; i < 27; i++) {
  ResourceKeys.items.push(`./world/items/items${i}.png`);
}

function makeTextureCache(resourceType: string) {
  const textureCache = new Map<number, PIXI.Texture>();
  return (type: number, tilesWidth = 1, tilesHeight = 1) => {
    let texture = textureCache.get(type);
    if (texture) {
      return texture;
    }

    const textureIndex = Math.floor(type / 100);
    const resourceKey = ResourceKeys[resourceType][textureIndex];
    texture = new PIXI.Texture(
      PIXI.loader.resources[resourceKey].texture.baseTexture,
      new PIXI.Rectangle((type % 10) * 32, Math.floor((type % 100) / 10) * 32, tilesWidth * 32, tilesHeight * 32),
    );
    textureCache.set(type, texture);
    return texture;
  };
}

const getTexture = {
  creatures: makeTextureCache('creatures'),
  floors: makeTextureCache('floors'),
  items: makeTextureCache('items'),
  templates: makeTextureCache('templates'),
};

const Helper = {
  canUseHand(itemType: number) {
    return Helper.usageExists(0, itemType);
  },
  usageExists(tool: number, focus: number) {
    return getItemUses(tool, focus).length !== 0;
  },
  useHand(loc: TilePoint) {
    wire.send('use', {
      toolIndex: -1,
      loc,
    });
  },
  useTool(loc: TilePoint, usageIndex?: number) {
    const toolIndex = Helper.getSelectedToolIndex();
    const tool = Helper.getSelectedTool();
    const focus = client.context.map.getItem(loc);
    const usages = getItemUses(tool.type, focus.type);

    if (usages.length === 0) {
      return;
    }

    if (usages.length === 1 || usageIndex !== undefined) {
      wire.send('use', {
        toolIndex,
        loc,
        usageIndex,
      });
    } else {
      Draw.makeUsageWindow(tool, focus, usages, loc);
    }
  },
  // TODO: add tests checking that subscribed containers are updated in all clients.
  // TODO: don't keep requesting container if already open.
  openContainer(loc: TilePoint) {
    wire.send('requestContainer', {
      loc,
    });
  },
  closeContainer(containerId: number) {
    wire.send('closeContainer', {
      containerId,
    });
  },
  getZ() {
    const focusCreature = client.context.getCreature(client.creatureId);
    return focusCreature ? focusCreature.pos.z : 0;
  },
  getSelectedTool() {
    const inventoryWindow = containerWindows.get(client.containerId);
    return inventoryWindow.itemsContainer.items[inventoryWindow.selectedIndex];
  },
  getSelectedToolIndex() {
    const inventoryWindow = containerWindows.get(client.containerId);
    return inventoryWindow.selectedIndex;
  },
  find(query: string, node?: Element): HTMLElement {
    if (!node) node = document.body;
    const result = node.querySelector(query);
    if (!result) throw new Error(`no elements matching ${query}`);
    if (!(result instanceof HTMLElement)) throw new Error('expected HTMLElement');
    return result;
  },
};

interface GridiaWindow {
  container: PIXI.Container;
  draw: () => void;
}

const Draw = {
  makeDraggableWindow() {
    const borderSize = 10;

    const container = new PIXI.Container();
    container.interactive = true;

    const border = new PIXI.Graphics();
    border.interactive = true;
    container.addChild(border);

    const contents = new PIXI.Container();
    contents.interactive = true;
    contents.x = borderSize;
    contents.y = borderSize;
    container.addChild(contents);

    let dragging = false;
    let downAt = null;
    let startingPosition = null;
    const onDragBegin = (e: PIXI.interaction.InteractionEvent) => {
      // ts - ignore TouchEvent
      if (!('pageX' in e.data.originalEvent)) return;

      // Only drag from the border.
      if (e.target !== border) return;

      dragging = true;
      downAt = { x: e.data.originalEvent.pageX, y: e.data.originalEvent.pageY };
      startingPosition = { x: container.x, y: container.y };
    };
    const onDrag = (e: PIXI.interaction.InteractionEvent) => {
      // ts - ignore TouchEvent
      if (!('pageX' in e.data.originalEvent)) return;

      if (dragging) {
        container.x = startingPosition.x + e.data.originalEvent.pageX - downAt.x;
        container.y = startingPosition.y + e.data.originalEvent.pageY - downAt.y;

        const size = getCanvasSize();
        container.x = clamp(container.x, 0, size.width - container.width);
        container.y = clamp(container.y, 0, size.height - container.height);
      }
    };
    const onDragEnd = () => {
      dragging = false;
      downAt = null;
      startingPosition = null;
    };

    function draw() {
      border.clear();
      border.beginFill(0, 0.2);
      border.lineStyle(borderSize, 0, 1, 0);
      border.drawRect(0, 0, contents.width + 2 * borderSize, contents.height + 2 * borderSize);
    }

    container.on('mousedown', onDragBegin)
      .on('mousemove', onDrag)
      .on('mouseup', onDragEnd)
      .on('mouseupoutside', onDragEnd);

    // TODO better names
    const window = {
      container,
      contents,
      draw,
    };

    return window;
  },

  makeItemContainerWindow(container: Container) {
    const window = Draw.makeDraggableWindow();
    const containerWindow = {
      container: window.container,
      draw,
      itemsContainer: container,
      mouseOverIndex: null,
      _selectedIndex: 0,
      // Selected item actions are based off currently selected tool. If
      // the tool changes, should re-render the selected item panel.
      set selectedIndex(selectedIndex: number) {
        this._selectedIndex = selectedIndex;
        selectItem(state.selectedTile);
      },
      get selectedIndex() { return this._selectedIndex; },
    };

    let mouseDownIndex: number;

    window.contents
      .on('mousedown', (e: PIXI.interaction.InteractionEvent) => {
        const x = e.data.getLocalPosition(e.target).x;
        const index = Math.floor(x / 32);
        if (!container.items[index]) return;
        mouseDownIndex = index;
        const evt: ItemMoveEvent = {
          source: container.id,
          loc: { x: index, y: 0, z: 0 },
          item: container.items[index],
        };
        client.eventEmitter.emit('ItemMoveBegin', evt);
      })
      .on('mousemove', (e: PIXI.interaction.InteractionEvent) => {
        if (e.target !== window.contents) {
          containerWindow.mouseOverIndex = null;
          return;
        }

        const x = e.data.getLocalPosition(e.target).x;
        const index = Math.floor(x / 32);
        if (index >= 0 && index < container.items.length) {
          containerWindow.mouseOverIndex = index;
        } else {
          containerWindow.mouseOverIndex = null;
        }
      })
      .on('mouseup', (e: PIXI.interaction.InteractionEvent) => {
        if (containerWindow.mouseOverIndex !== null) {
          const evt: ItemMoveEvent = {
            source: container.id,
            loc: { x: containerWindow.mouseOverIndex, y: 0, z: 0 },
          };
          client.eventEmitter.emit('ItemMoveEnd', evt);
        }
        if (mouseDownIndex === containerWindow.mouseOverIndex) {
          containerWindow.selectedIndex = mouseDownIndex;
        }
      });

    if (container.id !== client.containerId) {
      client.eventEmitter.on('PlayerMove', close);
    }

    function close() {
      client.eventEmitter.removeListener('PlayerMove', close);
      game.removeWindow(containerWindow);
      containerWindows.delete(container.id);
      client.context.containers.delete(container.id);
    }

    function draw() {
      // Hack: b/c container is requested multiple times, 'container' reference can get stale.
      container = client.context.containers.get(container.id);
      window.contents.removeChildren();
      for (const [i, item] of container.items.entries()) {
        const itemSprite = Draw.makeItemSprite(item ? item : { type: 0, quantity: 1 });
        itemSprite.x = i * 32;
        itemSprite.y = 0;
        if (containerWindow.selectedIndex === i) {
          itemSprite.filters = [new OutlineFilter(1, 0xFFFF00, 1)];
        }
        window.contents.addChild(itemSprite);
      }

      if (containerWindow.mouseOverIndex !== null && state.mouse.state === 'down') {
        const mouseHighlight = Draw.makeHighlight(0xffff00, 0.3);
        mouseHighlight.x = 32 * containerWindow.mouseOverIndex;
        mouseHighlight.y = 0;
        window.contents.addChild(mouseHighlight);
      }

      window.draw();
    }

    // TODO: take actual positions of windows into account.
    window.container.y = (containerWindows.size - 1) * 50;
    game.addWindow(containerWindow);
    return containerWindow;
  },

  makeUsageWindow(tool: Item, focus: Item, usages: ItemUse[], loc: TilePoint) {
    const window = Draw.makeDraggableWindow();
    const usageWindow = {
      container: window.container,
      draw,
    };

    window.contents
      .on('mousedown', (e: PIXI.interaction.InteractionEvent) => {
        const {x, y} = e.data.getLocalPosition(e.target);
        const index = Math.floor(x / 32) + Math.floor(y / 32) * 10;
        close();
        Helper.useTool(loc, index);
      });

    client.eventEmitter.on('PlayerMove', close);

    function close() {
      client.eventEmitter.removeListener('PlayerMove', close);
      game.removeWindow(usageWindow);
    }

    function draw() {
      window.contents.removeChildren();
      for (const [i, usage] of usages.entries()) {
        const item = usage.products[0];
        const itemSprite = Draw.makeItemSprite(item);
        itemSprite.x = (i % 10) * 32;
        itemSprite.y = Math.floor(i / 10) * 32;
        window.contents.addChild(itemSprite);
      }

      window.draw();
    }

    window.container.x = window.container.y = 40;
    game.addWindow(usageWindow);
    return usageWindow;
  },

  makeHighlight(color: number, alpha: number) {
    const highlight = new PIXI.Graphics();
    highlight.beginFill(color, alpha);
    highlight.drawRect(0, 0, 32, 32);
    return highlight;
  },

  makeItemSprite(item: Item) {
    const meta = getMetaItem(item.type);
    let texture = 1;
    if (meta.animations) {
      if (meta.animations.length === 1) {
        texture = meta.animations[0];
      } else if (meta.animations.length > 1) {
        const index = Math.floor((state.elapsedFrames * (60 / 1000)) % meta.animations.length);
        texture = meta.animations[index];
      }
    }
    const imgHeight = meta.imageHeight || 1;
    const sprite = new PIXI.Sprite(getTexture.items(texture, 1, imgHeight));
    sprite.anchor.y = (imgHeight - 1) / imgHeight;

    if (item.quantity !== 1) {
      const qty = new PIXI.Text(item.quantity.toString(), {
        fontSize: 14,
        stroke: 0xffffff,
        strokeThickness: 4,
      });
      sprite.addChild(qty);
    }
    return sprite;
  },
};

interface ItemMoveEvent {
  source: number;
  loc?: TilePoint;
  item?: Item;
}

type ContainerWindow = ReturnType<typeof Draw.makeItemContainerWindow>;
const containerWindows = new Map<number, ContainerWindow>();

function getCanvasSize() {
  const canvasesEl = Helper.find('#canvases');
  return canvasesEl.getBoundingClientRect();
}

const ContextMenu = {
  get() {
    return Helper.find('.contextmenu');
  },

  isOpen() {
    return ContextMenu.get().style.display === 'block';
  },

  close() {
    ContextMenu.get().style.display = 'none';
  },

  openForTile(screen: ScreenPoint, loc: TilePoint) {
    const contextMenuEl = ContextMenu.get();
    contextMenuEl.style.display = 'block';
    contextMenuEl.style.left = screen.x + 'px';
    contextMenuEl.style.top = screen.y + 'px';

    contextMenuEl.innerHTML = '';
    const actions = getActionsForTile(loc);
    actions.push({
      innerText: 'Cancel',
      title: '',
      action: 'cancel',
    });
    actions.push({
      innerText: 'Move Here',
      title: '',
      action: 'move-here',
    });
    for (const action of actions) {
      const actionEl = document.createElement('div');
      actionEl.innerText = action.innerText;
      actionEl.dataset.action = action.action;
      actionEl.dataset.loc = JSON.stringify(loc);
      actionEl.title = action.title;
      contextMenuEl.appendChild(actionEl);
    }
  },
};

function getActionsForTile(loc: TilePoint) {
  const item = client.context.map.getItem(loc);
  const meta = getMetaItem(item ? item.type : 0);
  const actions = [] as Array<{innerText: string, title: string, action: SelectedItemAction}>;

  if (item && meta.moveable) {
    actions.push({
      innerText: 'Pickup',
      title: 'Shortcut: Shift',
      action: 'pickup',
    });
  }

  if (item && Helper.canUseHand(item.type)) {
    actions.push({
      innerText: 'Use Hand',
      title: 'Shortcut: Alt',
      action: 'use-hand',
    });
  }

  if (meta.class === 'Container') {
    actions.push({
      innerText: 'Open',
      title: 'Look inside',
      action: 'open-container',
    });
  }

  if (state.selectedTile) {
    const tool = Helper.getSelectedTool();
    if (tool && Helper.usageExists(tool.type, meta.id)) {
      actions.push({
        innerText: `Use ${getMetaItem(tool.type).name}`,
        title: 'Shortcut: Spacebar',
        action: 'use-tool',
      });
    }
  }

  return actions;
}

function renderSelectedItem() {
  const el = Helper.find('.selected-item');
  const item = state.selectedTile ? client.context.map.getItem(state.selectedTile) : null;
  let data;
  let meta;
  if (item) {
    meta = getMetaItem(item.type);
    data = {
      name: meta.name,
      quantity: item.quantity,
      burden: item.quantity * meta.burden,
      misc: JSON.stringify(meta, null, 2),
    };
  } else {
    data = {
      name: '-',
      quantity: 0,
      burden: 0,
      misc: '',
    };
  }

  Helper.find('.selected-item--name', el).innerHTML = `Item: ${data.name}`;
  Helper.find('.selected-item--quantity', el).innerHTML = `Quantity: ${data.quantity}`;
  Helper.find('.selected-item--burden', el).innerHTML = `Burden: ${data.burden}`;
  Helper.find('.selected-item--misc', el).innerHTML = data.misc;

  const actionsEl = Helper.find('.selected-item--actions', el);
  actionsEl.innerHTML = 'Actions:';

  if (!meta) return;

  const actions = getActionsForTile(state.selectedTile);
  for (const action of actions) {
    const actionEl = document.createElement('button');
    actionEl.innerText = action.innerText;
    actionEl.dataset.action = action.action;
    actionEl.dataset.loc = JSON.stringify(state.selectedTile);
    actionEl.title = action.title;
    actionsEl.appendChild(actionEl);
  }
}

function registerPanelListeners() {
  Helper.find('.panels__tabs').addEventListener('click', (e) => {
    Helper.find('.panels__tab--active').classList.toggle('panels__tab--active');
    Helper.find('.panel--active').classList.toggle('panel--active');

    const targetEl = e.target as HTMLElement;
    const panelName = targetEl.dataset.panel;
    targetEl.classList.toggle('panels__tab--active');
    Helper.find('.panel--' + panelName).classList.toggle('panel--active');
  });

  Helper.find('.settings').addEventListener('change', (e) => {
    if (!(e.target instanceof HTMLInputElement)) return;

    client.settings[e.target.id] = e.target.valueAsNumber;
    // TODO: save and load settings.
  });

  const getInput = (id: string) => Helper.find('.settings #' + id) as HTMLInputElement;
  getInput('volume').value = String(client.settings.volume);
}

// TODO: rename.
type SelectedItemAction =
  'cancel' |
  'move-here' |
  'open-container' |
  'pickup' |
  'use-hand' |
  'use-tool';

function onAction(e: Event) {
  // @ts-ignore
  const type: SelectedItemAction = e.target.dataset.action;
  // @ts-ignore
  const loc: TilePoint = JSON.parse(e.target.dataset.loc);

  switch (type) {
    case 'pickup':
      wire.send('moveItem', {
        fromSource: 0,
        from: loc,
        toSource: client.containerId,
      });
      break;
    case 'use-hand':
      Helper.useHand(loc);
      break;
    case 'use-tool':
      Helper.useTool(loc);
      break;
    case 'open-container':
      Helper.openContainer(loc);
      break;
    case 'move-here':
      const focusPos = client.context.getCreature(client.creatureId).pos;
      state.pathToDestination = findPath(client.context.map, focusPos, loc);
      state.destination = loc;
      break;
    case 'cancel':
      // Do nothing.
      break;
    default:
      console.error('unknown action type', type);
  }

  ContextMenu.close();
}

function selectItem(loc?: TilePoint) {
  state.selectedTile = loc;
  renderSelectedItem();
}

function invalidateDestination() {
  state.destination = null;
  state.pathToDestination = [];
}

function worldToTile(pw: ScreenPoint) {
  return _worldToTile(pw, Helper.getZ());
}

function mouseToWorld(pm: ScreenPoint): ScreenPoint {
  return {
    x: pm.x + state.viewport.x,
    y: pm.y + state.viewport.y,
  };
}

class Game {
  protected app: PIXI.Application;
  protected canvasesEl: HTMLElement;
  protected containers: Record<string, PIXI.Container> = {};
  protected windows: GridiaWindow[] = [];
  protected itemMovingState: ItemMoveEvent = null;
  protected mouseHasMovedSinceItemMoveBegin = false;

  public async start() {
    let connectOverSocket = !window.location.hostname.includes('localhost');
    if (window.location.search.includes('socket')) {
      connectOverSocket = true;
    } else if (window.location.search.includes('memory')) {
      connectOverSocket = false;
    }

    if (connectOverSocket) {
      wire = await connect(client, 9001);
    } else {
      const serverAndWire = openAndConnectToServerInMemory(client, {
        dummyDelay: 20,
        verbose: true,
      });
      wire = serverAndWire.clientToServerWire;
      // @ts-ignore debugging.
      Gridia.server = serverAndWire.server;

      setInterval(() => {
        serverAndWire.server.tick();
      }, 50);
    }

    PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
    this.app = new PIXI.Application();

    this.canvasesEl = document.body.querySelector('#canvases');
    this.canvasesEl.appendChild(this.app.view);

    Helper.find('.selected-item--actions').addEventListener('click', onAction);
    Helper.find('.contextmenu').addEventListener('click', onAction);

    PIXI.loader
      .add(Object.values(ResourceKeys))
      .add(convertToPixiLoaderEntries(SfxKeys))
      .on('progress', (loader, resource) => console.log('loading ' + loader.progress + '%'))
      .load(this.onLoad.bind(this));
  }

  public onLoad() {
    const world = this.containers.world = new PIXI.Container();
    this.app.stage.addChild(world);
    world.addChild(this.containers.floorLayer = new PIXI.Container());
    world.addChild(this.containers.itemAndCreatureLayer = new PIXI.Container());
    world.addChild(this.containers.topLayer = new PIXI.Container());
    this.app.ticker.add(this.tick.bind(this));
    this.registerListeners();

    // This makes everything "pop".
    // this.containers.itemAndCreatureLayer.filters = [new OutlineFilter(0.5, 0, 1)];
  }

  public trip() {
    const filtersBefore = this.containers.itemAndCreatureLayer.filters;
    const filter = new OutlineFilter(0, 0, 1);
    const start = performance.now();
    this.containers.itemAndCreatureLayer.filters = [filter];
    const handle = setInterval(() => {
      const multiplier = 0.5 + Math.cos((performance.now() - start) / 1000) / 2;
      filter.thickness = 2 + multiplier * 3;
    }, 100);
    setTimeout(() => {
      clearInterval(handle);
      this.containers.itemAndCreatureLayer.filters = filtersBefore;
    }, 1000 * 10);
  }

  public addWindow(window: GridiaWindow) {
    this.windows.push(window);
    this.app.stage.addChild(window.container);
  }

  public removeWindow(window: GridiaWindow) {
    this.windows.splice(this.windows.indexOf(window), 1);
    this.app.stage.removeChild(window.container);
  }

  public registerListeners() {
    this.canvasesEl.addEventListener('mousemove', (e: MouseEvent) => {
      state.mouse = {
        ...state.mouse,
        x: e.clientX,
        y: e.clientY,
        tile: worldToTile(mouseToWorld({ x: e.clientX, y: e.clientY })),
      };
    });

    this.canvasesEl.addEventListener('mousedown', (e: MouseEvent) => {
      state.mouse = {
        ...state.mouse,
        state: 'down',
        downTile: state.mouse.tile,
      };
    });

    this.canvasesEl.addEventListener('mouseup', (e: MouseEvent) => {
      state.mouse = {
        ...state.mouse,
        state: 'up',
      };
    });

    this.canvasesEl.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      const mouse = { x: e.pageX, y: e.pageY };
      const tile = worldToTile(mouseToWorld(mouse));
      ContextMenu.openForTile(mouse, tile);
    });

    const world = this.containers.world;
    world.interactive = true;
    world.on('mousedown', (e: PIXI.interaction.InteractionEvent) => {
      // ts - ignore TouchEvent
      if (!('pageX' in e.data.originalEvent)) return;

      const point = worldToTile(mouseToWorld({ x: e.data.originalEvent.pageX, y: e.data.originalEvent.pageY }));
      if (!client.context.map.inBounds(point)) return;
      const item = client.context.map.getItem(point);
      if (!item || !item.type) return;

      client.eventEmitter.emit('ItemMoveBegin', {
        source: 0,
        loc: state.mouse.tile,
        item,
      });
    });
    world.on('mouseup', (e: PIXI.interaction.InteractionEvent) => {
      // if (!itemMovingState) {
      //   const point = worldToTile(e.data.getLocalPosition(world));
      //   if (client.context.map.inBounds(point)) {
      //     client.context.map.getTile(point).floor = ++client.context.map.getTile(point).floor % 10;
      //   }
      // }

      const focusCreature = client.context.getCreature(client.creatureId);
      if (focusCreature && equalPoints(state.mouse.tile, focusCreature.pos)) {
        const evt: ItemMoveEvent = {
          source: client.containerId,
        };
        client.eventEmitter.emit('ItemMoveEnd', evt);
      } else if (state.mouse.tile) {
        const evt: ItemMoveEvent = {
          source: 0,
          loc: state.mouse.tile,
        };
        client.eventEmitter.emit('ItemMoveEnd', evt);
      }
    });
    world.on('click', (e: PIXI.interaction.InteractionEvent) => {
      // ts - ignore TouchEvent
      if (!('pageX' in e.data.originalEvent)) return;

      if (ContextMenu.isOpen()) {
        ContextMenu.close();
        return;
      }

      const point = worldToTile(mouseToWorld({ x: e.data.originalEvent.pageX, y: e.data.originalEvent.pageY }));
      selectItem(point);
    });

    document.onkeydown = (e) => {
      state.keys[e.keyCode] = true;
    };
    document.onkeyup = (e) => {
      delete state.keys[e.keyCode];

      const focusCreature = client.context.getCreature(client.creatureId);
      if (!focusCreature) return;
      const inventoryWindow = containerWindows.get(client.containerId);

      // Number keys for selecting tool in inventory.
      if (e.keyCode >= KEYS.ZERO && e.keyCode <= KEYS.NINE) {
        const num = e.keyCode - KEYS.ZERO;

        // 1234567890
        if (num === 0) {
          inventoryWindow.selectedIndex = 9;
        } else {
          inventoryWindow.selectedIndex = num - 1;
        }
        inventoryWindow.draw();
      }

      // Arrow keys for selecting tile in world.
      let dx = 0, dy = 0;
      if (e.keyCode === KEYS.UP_ARROW) {
        dy -= 1;
      } else if (e.keyCode === KEYS.DOWN_ARROW) {
        dy += 1;
      }
      if (e.keyCode === KEYS.LEFT_ARROW) {
        dx -= 1;
      } else if (e.keyCode === KEYS.RIGHT_ARROW) {
        dx += 1;
      }

      if (dx || dy) {
        state.selectedTile = state.selectedTile || { ...focusCreature.pos };
        state.selectedTile.x += dx;
        state.selectedTile.y += dy;
        selectItem(state.selectedTile);
      }

      // Space bar to use tool.
      if (e.keyCode === KEYS.SPACE_BAR && state.selectedTile) {
        Helper.useTool(state.selectedTile);
      }

      // Shift to pick up item.
      if (e.keyCode === KEYS.SHIFT && state.selectedTile) {
        wire.send('moveItem', {
          fromSource: 0,
          from: state.selectedTile,
          toSource: client.containerId,
          to: null,
        });
      }

      // Alt to use hand on item.
      if (e.key === 'Alt' && state.selectedTile) {
        Helper.useHand(state.selectedTile);
      }

      // T to toggle z.
      if (e.key === 't') {
        wire.send('move', {
          ...focusCreature.pos,
          z: 1 - focusCreature.pos.z,
        });
      }
    };

    // resize the canvas to fill browser window dynamically
    const resize = () => {
      const size = getCanvasSize();
      this.app.renderer.resize(size.width, size.height);
    };
    window.addEventListener('resize', resize);
    resize();

    client.eventEmitter.on('ItemMoveBegin', (e: ItemMoveEvent) => {
      this.itemMovingState = e;
      this.mouseHasMovedSinceItemMoveBegin = false;
      world.once('mousemove', () => {
        this.mouseHasMovedSinceItemMoveBegin = true;
      });
    });
    client.eventEmitter.on('ItemMoveEnd', (e: ItemMoveEvent) => {
      if (!this.itemMovingState) return;

      wire.send('moveItem', {
        from: this.itemMovingState.loc,
        fromSource: this.itemMovingState.source,
        to: e.loc,
        toSource: e.source,
      });
      this.itemMovingState = null;
    });
    client.eventEmitter.on('message', (e) => {
      // TODO improve type checking.
      if (e.type === 'setItem') {
        const loc = {x: e.args.x, y: e.args.y, z: e.args.z};
        if (equalPoints(loc, state.selectedTile)) {
          selectItem(state.selectedTile);
        }
      }
    });

    registerPanelListeners();
  }

  public tick() {
    state.elapsedFrames = (state.elapsedFrames + 1) % 60000;

    const focusCreature = client.context.getCreature(client.creatureId);
    const focusPos = focusCreature ? focusCreature.pos : { x: 0, y: 0, z: 0 };
    const z = focusPos.z;

    if (!focusCreature) return;
    if (client.context.map.width === 0) return;

    // Make container windows.
    for (const [id, container] of client.context.containers.entries()) {
      if (!containerWindows.has(id)) {
        const containerWindow = Draw.makeItemContainerWindow(container);
        containerWindows.set(id, containerWindow);

        // Inventory.
        if (id === client.containerId) {
          // Draw so width and height are set.
          containerWindow.draw();
          const size = getCanvasSize();
          containerWindow.container.x = size.width / 2 - containerWindow.container.width / 2;
          containerWindow.container.y = size.height - containerWindow.container.height;
        }
      }
    }

    // Draw windows.
    for (const window of this.windows) {
      window.draw();
    }

    state.viewport = {
      x: focusPos.x * 32 - this.app.view.width / 2,
      y: focusPos.y * 32 - this.app.view.height / 2,
    };

    const tilesWidth = Math.ceil(this.app.view.width / 32);
    const tilesHeight = Math.ceil(this.app.view.height / 32);
    const startTileX = Math.floor(state.viewport.x / 32);
    const startTileY = Math.floor(state.viewport.y / 32);
    const endTileX = startTileX + tilesWidth;
    const endTileY = startTileY + tilesHeight;

    this.containers.floorLayer.removeChildren();
    for (let x = startTileX; x <= endTileX; x++) {
      for (let y = startTileY; y <= endTileY; y++) {
        const floor = client.context.map.getTile({ x, y, z }).floor;

        let sprite;
        if (floor === WATER) {
          const template = getWaterFloor(client.context.map, { x, y, z });
          sprite = new PIXI.Sprite(getTexture.templates(template));
        } else if (floor === MINE) {
          const template = getMineFloor(client.context.map, { x, y, z });
          sprite = new PIXI.Sprite(getTexture.templates(template));
        } else {
          sprite = new PIXI.Sprite(getTexture.floors(floor));
        }

        sprite.x = x * 32;
        sprite.y = y * 32;
        this.containers.floorLayer.addChild(sprite);
      }
    }

    // TODO don't recreate all these sprites every frame. First pass here, but it's
    // is overcomplicated and not worth using yet.
    // const floorSpritesToRemove = new Set(Object.keys(floorLayer2.pointToSprite));
    // for (let x = startTileX; x <= endTileX; x++) {
    //   for (let y = startTileY; y <= endTileY; y++) {
    //     function makeSprite() {
    //       let sprite;
    //       if (floor === 1) {
    //         const template = getWaterFloor({ x, y });
    //         sprite = new PIXI.Sprite(getTexture.templates(template));
    //       } else {
    //         sprite = new PIXI.Sprite(getTexture.floors(floor));
    //       }

    //       sprite.x = x * 32;
    //       sprite.y = y * 32;
    //       floorLayer2.layer.addChild(sprite);
    //       floorLayer2.pointToSprite[`${x},${y}`] = {sprite, floor}
    //       return sprite;
    //     }

    //     const floor = client.world.getTile({ x, y }).floor;

    //     const currentSprite = floorLayer2.pointToSprite[`${x},${y}`];
    //     if (currentSprite) {
    //       floorSpritesToRemove.delete(`${x},${y}`);
    //       if (floor === currentSprite.floor) {
    //         continue;
    //       }
    //     }

    //     makeSprite();
    //   }
    // }
    // for (const key of floorSpritesToRemove) {
    //   floorLayer2.pointToSprite[key].sprite.destroy();
    //   delete floorLayer2.pointToSprite[key];
    // }

    this.containers.itemAndCreatureLayer.removeChildren();
    for (let x = startTileX; x <= endTileX; x++) {
      for (let y = startTileY; y <= endTileY; y++) {
        const tile = client.context.map.getTile({ x, y, z });
        if (tile.item) {
          const itemSprite = Draw.makeItemSprite(tile.item);
          itemSprite.x = x * 32;
          itemSprite.y = y * 32;
          this.containers.itemAndCreatureLayer.addChild(itemSprite);
        }

        if (tile.creature) {
          const creatureSprite = new PIXI.Sprite(getTexture.creatures(tile.creature.image - 1));
          creatureSprite.x = x * 32;
          creatureSprite.y = y * 32;
          this.containers.itemAndCreatureLayer.addChild(creatureSprite);

          const label = new PIXI.Text(tile.creature.name,
            {fill: 'white', stroke: 'black', strokeThickness: 3, lineJoin: 'round', fontSize: 16});
          label.anchor.x = 0.5;
          label.anchor.y = 1;
          creatureSprite.addChild(label);
        }
      }
    }

    if (focusCreature && performance.now() - state.lastMove > 200) {
      let dest: TilePoint = { ...focusCreature.pos };

      const keyInputDelta = {x: 0, y: 0, z: 0};
      if (state.keys[KEYS.W]) {
        keyInputDelta.y -= 1;
      } else if (state.keys[KEYS.S]) {
        keyInputDelta.y += 1;
      }
      if (state.keys[KEYS.A]) {
        keyInputDelta.x -= 1;
      } else if (state.keys[KEYS.D]) {
        keyInputDelta.x += 1;
      }

      if (state.destination && state.destination.z !== focusCreature.pos.z) {
        invalidateDestination();
      }

      if (!equalPoints(keyInputDelta, {x: 0, y: 0, z: 0})) {
        dest = { ...focusCreature.pos };
        dest.x += keyInputDelta.x;
        dest.y += keyInputDelta.y;
        invalidateDestination();
      } else if (state.destination) {
        dest = state.pathToDestination.splice(0, 1)[0];
      }

      if (dest && !equalPoints(dest, focusCreature.pos)) {
        const itemToMoveTo = client.context.map.getItem(dest);
        if (itemToMoveTo && getMetaItem(itemToMoveTo.type).class === 'Container') {
          Helper.openContainer(dest);
        }

        if (client.context.map.walkable(dest)) {
          selectItem(undefined);
          ContextMenu.close();
          state.lastMove = performance.now();
          wire.send('move', dest);
          client.eventEmitter.emit('PlayerMove');
          if (state.destination && equalPoints(state.destination, dest)) {
            invalidateDestination();
          }

          delete state.mouse.tile;
        } else {
          // TODO - repath.
          invalidateDestination();
        }
      }
    }

    this.containers.topLayer.removeChildren();

    // Draw item being moved.
    if (this.itemMovingState && this.mouseHasMovedSinceItemMoveBegin && this.itemMovingState.item) {
      const itemSprite = Draw.makeItemSprite(this.itemMovingState.item);
      const { x, y } = mouseToWorld(state.mouse);
      itemSprite.x = x - 16;
      itemSprite.y = y - 16;
      this.containers.topLayer.addChild(itemSprite);
    }

    // Draw selected highlight.
    if (state.selectedTile) {
      const selectedItem = client.context.map.getItem(state.selectedTile);
      const highlight = Draw.makeHighlight(0xffff00, 0.2);
      highlight.x = state.selectedTile.x * 32;
      highlight.y = state.selectedTile.y * 32;
      const tool = Helper.getSelectedTool();
      if (tool && selectedItem && Helper.usageExists(tool.type, selectedItem.type)) {
        const itemSprite = Draw.makeItemSprite({type: tool.type, quantity: 1});
        itemSprite.anchor.x = itemSprite.anchor.y = 0.5;
        highlight.addChild(itemSprite);
      }
      this.containers.topLayer.addChild(highlight);
    }

    // Draw name of item under mouse.
    const itemUnderMouse = state.mouse.tile && client.context.map.getItem(state.mouse.tile);
    if (itemUnderMouse) {
      const meta = getMetaItem(itemUnderMouse.type);
      const text = itemUnderMouse.quantity === 1 ? meta.name : `${meta.name} (${itemUnderMouse.quantity})`;
      const label = new PIXI.Text(text, {fill: 'white', stroke: 'black', strokeThickness: 6, lineJoin: 'round'});
      const { x, y } = mouseToWorld(state.mouse);
      label.anchor.x = 0.5;
      label.anchor.y = 1;
      label.x = x;
      label.y = y - 8;
      this.containers.topLayer.addChild(label);
    }

    this.containers.world.x = -focusPos.x * 32 + Math.floor(this.app.view.width / 2);
    this.containers.world.y = -focusPos.y * 32 + Math.floor(this.app.view.height / 2);
  }
}

let game: Game;
document.addEventListener('DOMContentLoaded', () => {
  game = new Game();
  game.start();
  // @ts-ignore
  window.Gridia.game = game;
});
