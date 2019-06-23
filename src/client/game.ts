import {OutlineFilter} from '@pixi/filter-outline';
import { MINE, WATER } from '../constants';
import * as Content from '../content';
import { game } from '../game-singleton';
import {equalPoints, worldToTile as _worldToTile} from '../utils';
import Client from './client';
import ClientModule from './client-module';
import { connect, openAndConnectToServerInMemory } from './connect-to-server';
import * as Draw from './draw';
import * as Helper from './helper';
import KEYS from './keys';
import { getMineFloor, getWaterFloor } from './template-draw';

interface GridiaWindow {
  container: PIXI.Container;
  draw: () => void;
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
    const tile = game.client.context.map.getTile(loc);
    const actions = game.getActionsFor(tile, loc);
    actions.push({
      type: 'cancel',
      innerText: 'Cancel',
      title: '',
    });
    if (game.client.context.map.walkable(loc)) {
      actions.push({
        type: 'move-here',
        innerText: 'Move Here',
        title: '',
      });
    }
    for (const action of actions) {
      const actionEl = document.createElement('div');
      actionEl.classList.add('action');
      actionEl.innerText = action.innerText;
      actionEl.dataset.action = JSON.stringify(action);
      actionEl.dataset.loc = JSON.stringify(loc);
      actionEl.title = action.title;
      contextMenuEl.appendChild(actionEl);
    }
  },
};

function renderSelectedView() {
  const el = Helper.find('.selected-view');
  const state = game.state;
  const tile = state.selectedView.tile ? game.client.context.map.getTile(state.selectedView.tile) : null;
  const item = tile ? tile.item : null;
  const creature =
    state.selectedView.creatureId ? game.client.context.getCreature(state.selectedView.creatureId) : null;

  let data: Record<string, string>;
  let meta;
  if (creature) {
    data = {
      name: creature.name,
    };
  } else if (item) {
    meta = Content.getMetaItem(item.type);
    data = {
      name: meta.name,
      quantity: String(item.quantity),
      burden: String(item.quantity * meta.burden),
      misc: JSON.stringify(meta, null, 2),
    };
  } else {
    data = {
      name: '-',
      quantity: '0',
      burden: '0',
      misc: '',
    };
  }

  const detailsEl = Helper.find('.selected-view--details', el);
  detailsEl.innerHTML = '';
  for (const [key, value] of Object.entries(data)) {
    const detailEl = document.createElement('div');
    detailEl.classList.add('.selected-view--detail', `.selected-view--detail-${key}`);
    detailEl.textContent = `${key[0].toUpperCase() + key.substr(1)}: ${value}`;
    detailsEl.appendChild(detailEl);
  }

  const actionsEl = Helper.find('.selected-view--actions', el);
  actionsEl.innerHTML = 'Actions:';

  const actions = tile ? game.getActionsFor(tile, game.state.selectedView.tile) : [];
  for (const action of actions) {
    const actionEl = document.createElement('button');
    actionEl.classList.add('action');
    actionEl.innerText = action.innerText;
    actionEl.dataset.action = JSON.stringify(action);
    if (creature) actionEl.dataset.creatureId = String(game.state.selectedView.creatureId);
    else actionEl.dataset.loc = JSON.stringify(game.state.selectedView.tile);
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
}

function globalOnActionHandler(e: GameActionEvent) {
  ContextMenu.close();

  const type = e.action.type;
  const {loc} = e;

  // Do nothing.
  if (type === 'cancel') return;

  if (loc) {
    switch (type) {
      case 'pickup':
        game.client.wire.send('moveItem', {
          fromSource: 0,
          from: loc,
          toSource: game.client.containerId,
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
      default:
        // console.error('unknown action type', type);
    }
  } else {
    switch (type) {
      case 'follow':
        // TODO path should update as creature moves.
        // game.state.pathToDestination = findPath(client.context.map, focusPos, creature.pos);
        // game.state.destination = creature.pos;
        break;
      default:
        console.error('unknown action type', type);
    }
  }
}

function selectView(loc?: TilePoint) {
  if (loc) {
    const creature = game.client.context.map.getTile(loc).creature;
    if (creature && creature.id !== game.client.creatureId) {
      game.state.selectedView.creatureId = creature.id;
      game.state.selectedView.tile = null;
    } else {
      game.state.selectedView.tile = loc;
      game.state.selectedView.creatureId = null;
    }
  } else {
    game.state.selectedView.tile = null;
    game.state.selectedView.creatureId = null;
  }

  renderSelectedView();
}

function worldToTile(pw: ScreenPoint) {
  return _worldToTile(pw, Helper.getZ());
}

function mouseToWorld(pm: ScreenPoint): ScreenPoint {
  return {
    x: pm.x + game.state.viewport.x,
    y: pm.y + game.state.viewport.y,
  };
}

class Game {
  public state: UIState;
  public keys: Record<number, boolean> = {};
  protected app: PIXI.Application;
  protected canvasesEl: HTMLElement;
  protected containers: Record<string, PIXI.Container> = {};
  protected windows: GridiaWindow[] = [];
  protected itemMovingState: ItemMoveEvent = null;
  protected mouseHasMovedSinceItemMoveBegin = false;
  protected modules: ClientModule[] = [];
  protected actionCreators: GameActionCreator[] = [];

  constructor(public client: Client) {
    this.state = {
      viewport: {
        x: 0,
        y: 0,
      },
      mouse: {
        x: 0,
        y: 0,
        state: '',
      },
      elapsedFrames: 0,
      selectedView: {},
    };
  }

  public addModule(clientModule: ClientModule) {
    this.modules.push(clientModule);
  }

  public addActionCreator(actionCreator: GameActionCreator) {
    this.actionCreators.push(actionCreator);
  }

  public getActionsFor(tile: Tile, loc: TilePoint): GameAction[] {
    const actions = [];

    for (const actionCreator of this.actionCreators) {
      const action = actionCreator(tile, loc);
      if (Array.isArray(action)) actions.push(...action);
      else if (action) actions.push(action);
    }

    return actions;
  }

  public async start() {
    this.client.eventEmitter.on('message', (e) => {
      // TODO improve type checking.
      if (e.type === 'setItem') {
        const loc = {x: e.args.x, y: e.args.y, z: e.args.z};
        if (equalPoints(loc, this.state.selectedView.tile)) {
          selectView(this.state.selectedView.tile);
        }
      }
    });

    let connectOverSocket = !window.location.hostname.includes('localhost');
    if (window.location.search.includes('socket')) {
      connectOverSocket = true;
    } else if (window.location.search.includes('memory')) {
      connectOverSocket = false;
    }

    if (connectOverSocket) {
      this.client.wire = await connect(this.client, 9001);
    } else {
      const serverAndWire = openAndConnectToServerInMemory(this.client, {
        dummyDelay: 20,
        verbose: true,
      });
      this.client.wire = serverAndWire.clientToServerWire;
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

    PIXI.loader
      .add(Object.values(Draw.getImageResourceKeys()))
      .add(Draw.getSfxResourceKeys())
      .on('progress', (loader, resource) => console.log('loading ' + loader.progress + '%'))
      .load(this.onLoad.bind(this));
  }

  public onLoad() {
    const world = this.containers.world = new PIXI.Container();
    this.app.stage.addChild(world);
    world.addChild(this.containers.floorLayer = new PIXI.Container());
    world.addChild(this.containers.itemAndCreatureLayer = new PIXI.Container());
    world.addChild(this.containers.topLayer = new PIXI.Container());

    this.modules.forEach((clientModule) => clientModule.onStart());

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
    const onActionSelection = (e: Event) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (!e.target.classList.contains('action')) return;

      // @ts-ignore
      const dataset = e.target.dataset;
      const action: GameAction = JSON.parse(dataset.action);
      const loc: TilePoint = JSON.parse(dataset.loc);
      const creatureId = Number(dataset.creatureId);
      const creature = creatureId ? this.client.context.getCreature(creatureId) : null;
      this.client.eventEmitter.emit('Action', {
        action,
        loc,
        creature,
      } as GameActionEvent);
    };
    Helper.find('.selected-view--actions').addEventListener('click', onActionSelection);
    Helper.find('.contextmenu').addEventListener('click', onActionSelection);

    this.canvasesEl.addEventListener('mousemove', (e: MouseEvent) => {
      this.state.mouse = {
        ...this.state.mouse,
        x: e.clientX,
        y: e.clientY,
        tile: worldToTile(mouseToWorld({ x: e.clientX, y: e.clientY })),
      };
    });

    this.canvasesEl.addEventListener('mousedown', (e: MouseEvent) => {
      this.state.mouse = {
        ...this.state.mouse,
        state: 'down',
        downTile: this.state.mouse.tile,
      };
    });

    this.canvasesEl.addEventListener('mouseup', (e: MouseEvent) => {
      this.state.mouse = {
        ...this.state.mouse,
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
      if (!this.client.context.map.inBounds(point)) return;
      const item = this.client.context.map.getItem(point);
      if (!item || !item.type) return;

      this.client.eventEmitter.emit('ItemMoveBegin', {
        source: 0,
        loc: this.state.mouse.tile,
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

      const focusCreature = this.client.context.getCreature(this.client.creatureId);
      if (focusCreature && equalPoints(this.state.mouse.tile, focusCreature.pos)) {
        const evt: ItemMoveEvent = {
          source: this.client.containerId,
        };
        this.client.eventEmitter.emit('ItemMoveEnd', evt);
      } else if (this.state.mouse.tile) {
        const evt: ItemMoveEvent = {
          source: 0,
          loc: this.state.mouse.tile,
        };
        this.client.eventEmitter.emit('ItemMoveEnd', evt);
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
      selectView(point);
    });

    document.onkeydown = (e) => {
      this.keys[e.keyCode] = true;
    };
    document.onkeyup = (e) => {
      delete this.keys[e.keyCode];

      const focusCreature = this.client.context.getCreature(this.client.creatureId);
      if (!focusCreature) return;
      const inventoryWindow = Draw.getContainerWindow(this.client.containerId);

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
        let currentCursor = null;
        if (this.state.selectedView.creatureId) {
          currentCursor = { ...this.client.context.getCreature(this.state.selectedView.creatureId).pos };
        } else if (this.state.selectedView.tile) {
          currentCursor = this.state.selectedView.tile;
        } else {
          currentCursor = { ...focusCreature.pos };
        }

        currentCursor.x += dx;
        currentCursor.y += dy;
        selectView(currentCursor);
        renderSelectedView();
      }

      // Space bar to use tool.
      if (e.keyCode === KEYS.SPACE_BAR && this.state.selectedView.tile) {
        Helper.useTool(this.state.selectedView.tile);
      }

      // Shift to pick up item.
      if (e.keyCode === KEYS.SHIFT && this.state.selectedView.tile) {
        this.client.wire.send('moveItem', {
          fromSource: 0,
          from: this.state.selectedView.tile,
          toSource: this.client.containerId,
          to: null,
        });
      }

      // Alt to use hand on item.
      if (e.key === 'Alt' && this.state.selectedView.tile) {
        Helper.useHand(this.state.selectedView.tile);
      }

      // T to toggle z.
      if (e.key === 't') {
        this.client.wire.send('move', {
          ...focusCreature.pos,
          z: 1 - focusCreature.pos.z,
        });
      }
    };

    // resize the canvas to fill browser window dynamically
    const resize = () => {
      const size = Draw.getCanvasSize();
      this.app.renderer.resize(size.width, size.height);
    };
    window.addEventListener('resize', resize);
    resize();

    this.client.eventEmitter.on('ItemMoveBegin', (e: ItemMoveEvent) => {
      this.itemMovingState = e;
      this.mouseHasMovedSinceItemMoveBegin = false;
      world.once('mousemove', () => {
        this.mouseHasMovedSinceItemMoveBegin = true;
      });
    });
    this.client.eventEmitter.on('ItemMoveEnd', (e: ItemMoveEvent) => {
      if (!this.itemMovingState) return;

      const from = this.itemMovingState.loc;
      const fromSource = this.itemMovingState.source;
      const to = e.loc;
      const toSource = e.source;
      if (!(fromSource === toSource && equalPoints(from, to))) {
        this.client.wire.send('moveItem', {
          from,
          fromSource,
          to,
          toSource,
        });
      }

      this.itemMovingState = null;
    });

    this.client.eventEmitter.on('containerWindowSelectedIndexChanged', () => {
      renderSelectedView();
    });

    this.client.eventEmitter.on('PlayerMove', () => {
      if (!this.state.selectedView.creatureId) selectView(undefined);
      ContextMenu.close();
    });

    this.client.eventEmitter.on('Action', globalOnActionHandler);

    registerPanelListeners();
  }

  public tick() {
    this.state.elapsedFrames = (this.state.elapsedFrames + 1) % 60000;

    const focusCreature = this.client.context.getCreature(this.client.creatureId);
    const focusPos = focusCreature ? focusCreature.pos : { x: 0, y: 0, z: 0 };
    const z = focusPos.z;

    if (!focusCreature) return;
    if (this.client.context.map.width === 0) return;

    // Make container windows.
    for (const [id, container] of this.client.context.containers.entries()) {
      if (!Draw.hasContainerWindow(id)) {
        const containerWindow = Draw.makeItemContainerWindow(container);
        Draw.setContainerWindow(id, containerWindow);

        // Inventory.
        if (id === this.client.containerId) {
          // Draw so width and height are set.
          containerWindow.draw();
          const size = Draw.getCanvasSize();
          containerWindow.container.x = size.width / 2 - containerWindow.container.width / 2;
          containerWindow.container.y = size.height - containerWindow.container.height;
        }
      }
    }

    // Draw windows.
    for (const window of this.windows) {
      window.draw();
    }

    this.state.viewport = {
      x: focusPos.x * 32 - this.app.view.width / 2,
      y: focusPos.y * 32 - this.app.view.height / 2,
    };

    const tilesWidth = Math.ceil(this.app.view.width / 32);
    const tilesHeight = Math.ceil(this.app.view.height / 32);
    const startTileX = Math.floor(this.state.viewport.x / 32);
    const startTileY = Math.floor(this.state.viewport.y / 32);
    const endTileX = startTileX + tilesWidth;
    const endTileY = startTileY + tilesHeight;

    this.containers.floorLayer.removeChildren();
    for (let x = startTileX; x <= endTileX; x++) {
      for (let y = startTileY; y <= endTileY; y++) {
        const floor = this.client.context.map.getTile({ x, y, z }).floor;

        let sprite;
        if (floor === WATER) {
          const template = getWaterFloor(this.client.context.map, { x, y, z });
          sprite = new PIXI.Sprite(Draw.getTexture.templates(template));
        } else if (floor === MINE) {
          const template = getMineFloor(this.client.context.map, { x, y, z });
          sprite = new PIXI.Sprite(Draw.getTexture.templates(template));
        } else {
          sprite = new PIXI.Sprite(Draw.getTexture.floors(floor));
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
        const tile = this.client.context.map.getTile({ x, y, z });
        if (tile.item) {
          const itemSprite = Draw.makeItemSprite(tile.item);
          itemSprite.x = x * 32;
          itemSprite.y = y * 32;
          this.containers.itemAndCreatureLayer.addChild(itemSprite);
        }

        if (tile.creature) {
          const creatureSprite = new PIXI.Sprite(Draw.getTexture.creatures(tile.creature.image - 1));
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

    this.containers.topLayer.removeChildren();

    // Draw item being moved.
    if (this.itemMovingState && this.mouseHasMovedSinceItemMoveBegin && this.itemMovingState.item) {
      const itemSprite = Draw.makeItemSprite(this.itemMovingState.item);
      const { x, y } = mouseToWorld(this.state.mouse);
      itemSprite.x = x - 16;
      itemSprite.y = y - 16;
      this.containers.topLayer.addChild(itemSprite);
    }

    // Draw highlight over selected view.
    const selectedViewLoc = this.state.selectedView.creatureId ?
    this.client.context.getCreature(this.state.selectedView.creatureId).pos :
      this.state.selectedView.tile;
    if (selectedViewLoc) {
      const highlight = Draw.makeHighlight(0xffff00, 0.2);
      highlight.x = selectedViewLoc.x * 32;
      highlight.y = selectedViewLoc.y * 32;
      this.containers.topLayer.addChild(highlight);

      // If item is the selected view, draw selected tool if usable.
      if (!this.state.selectedView.creatureId) {
        const tool = Helper.getSelectedTool();
        const selectedItem = this.client.context.map.getItem(this.state.selectedView.tile);
        if (tool && selectedItem && Helper.usageExists(tool.type, selectedItem.type)) {
          const itemSprite = Draw.makeItemSprite({type: tool.type, quantity: 1});
          itemSprite.anchor.x = itemSprite.anchor.y = 0.5;
          highlight.addChild(itemSprite);
        }
      }
    }

    // Draw name of item under mouse.
    const itemUnderMouse = this.state.mouse.tile && this.client.context.map.getItem(this.state.mouse.tile);
    if (itemUnderMouse) {
      const meta = Content.getMetaItem(itemUnderMouse.type);
      const text = itemUnderMouse.quantity === 1 ? meta.name : `${meta.name} (${itemUnderMouse.quantity})`;
      const label = new PIXI.Text(text, {fill: 'white', stroke: 'black', strokeThickness: 6, lineJoin: 'round'});
      const { x, y } = mouseToWorld(this.state.mouse);
      label.anchor.x = 0.5;
      label.anchor.y = 1;
      label.x = x;
      label.y = y - 8;
      this.containers.topLayer.addChild(label);
    }

    this.containers.world.x = -focusPos.x * 32 + Math.floor(this.app.view.width / 2);
    this.containers.world.y = -focusPos.y * 32 + Math.floor(this.app.view.height / 2);

    this.modules.forEach((clientModule) => clientModule.onTick());
  }
}

export default Game;
