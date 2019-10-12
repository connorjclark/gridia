import {OutlineFilter} from '@pixi/filter-outline';
import { MINE, WATER } from '../constants';
import * as Content from '../content';
import { game } from '../game-singleton';
import * as ProtocolBuilder from '../protocol/client-to-server-protocol-builder';
import {equalPoints, worldToTile as _worldToTile} from '../utils';
import Client from './client';
import ClientModule from './client-module';
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
      addDataToActionEl(actionEl, {
        action,
        loc,
        creature: tile.creature,
      });
      contextMenuEl.appendChild(actionEl);
    }
  },
};

function addDataToActionEl(actionEl: HTMLElement, opts: {action: GameAction, loc?: TilePoint, creature?: Creature}) {
  actionEl.classList.add('action');
  actionEl.title = opts.action.title;
  actionEl.innerText = opts.action.innerText;
  actionEl.dataset.action = JSON.stringify(opts.action);
  if (opts.loc) actionEl.dataset.loc = JSON.stringify(opts.loc);
  if (opts.creature) actionEl.dataset.creatureId = String(opts.creature.id);
}

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

  // If a creature is selected, do not show actions for the item on the tile.
  let actions: GameAction[] = [];
  if (creature) {
    actions = game.getActionsFor({floor: 0, creature}, game.state.selectedView.tile);
  } else if (tile) {
    actions = game.getActionsFor(tile, game.state.selectedView.tile);
  }
  for (const action of actions) {
    const actionEl = document.createElement('button');
    addDataToActionEl(actionEl, {
      action,
      loc: game.state.selectedView.tile,
      creature,
    });
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
    game.client.eventEmitter.emit('panelFocusChanged', {panelName});
  });
}

function selectView(loc: TilePoint | null) {
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
  return _worldToTile(Helper.getW(), pw, Helper.getZ());
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
  protected itemMovingState: ItemMoveBeginEvent | null = null;
  protected mouseHasMovedSinceItemMoveBegin = false;
  protected modules: ClientModule[] = [];
  protected actionCreators: GameActionCreator[] = [];

  private _playerCreature: Creature = null;
  private _currentHoverItemText =
    new PIXI.Text('', {fill: 'white', stroke: 'black', strokeThickness: 6, lineJoin: 'round'});
  private _isEditing = false;

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

  public isEditingMode() {
    return this._isEditing;
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

  public getPlayerPosition() {
    if (!this._playerCreature) this._playerCreature = this.client.context.getCreature(this.client.creatureId);
    if (this._playerCreature) return this._playerCreature.pos;
    return { w: 0, x: 0, y: 0, z: 0 };
  }

  public async start() {
    // Should only be used for refreshing UI, not updating game state.
    this.client.eventEmitter.on('message', (e) => {
      // TODO improve type checking.
      if (e.type === 'setItem' && this.state.selectedView.tile) {
        const loc = {w: e.args.w, x: e.args.x, y: e.args.y, z: e.args.z};
        if (equalPoints(loc, this.state.selectedView.tile)) {
          selectView(this.state.selectedView.tile);
        }
      }
    });

    PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
    this.app = new PIXI.Application();

    this.canvasesEl = Helper.find('#canvases');
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

    this._currentHoverItemText.x = 0;
    this._currentHoverItemText.y = 0;
    this.app.stage.addChild(this._currentHoverItemText);

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
      const loc: TilePoint = dataset.loc ? JSON.parse(dataset.loc) : null;
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

    this.canvasesEl.addEventListener('pointermove', (e: MouseEvent) => {
      const loc = worldToTile(mouseToWorld({ x: e.clientX, y: e.clientY }));
      this.state.mouse = {
        ...this.state.mouse,
        x: e.clientX,
        y: e.clientY,
        tile: loc,
      };
      if (this.client.context.map.inBounds(loc)) {
        this.client.eventEmitter.emit('MouseMovedOverTile', {...loc});
      }
    });

    this.canvasesEl.addEventListener('pointerdown', (e: MouseEvent) => {
      this.state.mouse = {
        ...this.state.mouse,
        state: 'down',
        downTile: this.state.mouse.tile,
      };
    });

    this.canvasesEl.addEventListener('pointerup', (e: MouseEvent) => {
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

    let longTouchTimer = null;
    this.canvasesEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (longTouchTimer) return;
      longTouchTimer = setTimeout(() => {
        const mouse = { x: e.targetTouches.item(0).pageX, y: e.targetTouches.item(0).pageY };
        const tile = worldToTile(mouseToWorld(mouse));
        ContextMenu.openForTile(mouse, tile);
        longTouchTimer = null;
      }, 1000);
    }, false);
    this.canvasesEl.addEventListener('touchend', () => {
      if (!longTouchTimer) return;
      clearInterval(longTouchTimer);
      longTouchTimer = null;
    }, false);

    const world = this.containers.world;
    world.interactive = true;
    world.on('pointerdown', (e: PIXI.interaction.InteractionEvent) => {
      if (this.isEditingMode()) return;

      const point = worldToTile(mouseToWorld({ x: e.data.global.x, y: e.data.global.y }));
      if (!this.client.context.map.inBounds(point)) return;
      const item = this.client.context.map.getItem(point);
      if (!item || !item.type) return;

      this.client.eventEmitter.emit('ItemMoveBegin', {
        source: 0,
        loc: this.state.mouse.tile,
        item,
      });
    });
    world.on('pointerup', (e: PIXI.interaction.InteractionEvent) => {
      if (equalPoints(this.state.mouse.tile, this.getPlayerPosition())) {
        const evt: ItemMoveEndEvent = {
          source: this.client.containerId,
        };
        this.client.eventEmitter.emit('ItemMoveEnd', evt);
      } else if (this.state.mouse.tile) {
        const evt: ItemMoveEndEvent = {
          source: 0,
          loc: this.state.mouse.tile,
        };
        this.client.eventEmitter.emit('ItemMoveEnd', evt);
      }
    });
    world.on('pointerdown', (e: PIXI.interaction.InteractionEvent) => {
      if (ContextMenu.isOpen()) {
        ContextMenu.close();
        return;
      }

      const loc = worldToTile(mouseToWorld({ x: e.data.global.x, y: e.data.global.y }));

      if (!this.isEditingMode()) {
        selectView(loc);
      }

      if (this.client.context.map.inBounds(loc)) {
        this.client.eventEmitter.emit('TileClicked', {...loc});
      }
    });

    document.onkeydown = (e) => {
      this.keys[e.keyCode] = true;
    };
    document.onkeyup = (e) => {
      delete this.keys[e.keyCode];

      // TODO replace with something better - game loaded / ready.
      // or just don't register these events until ready?
      if (!this._playerCreature) return;
      const focusPos = this.getPlayerPosition();
      const inventoryWindow = Draw.getContainerWindow(this.client.containerId);

      // Number keys for selecting tool in inventory.
      if (inventoryWindow && e.keyCode >= KEYS.ZERO && e.keyCode <= KEYS.NINE) {
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
          currentCursor = { ...focusPos };
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
        this.client.connection.send(ProtocolBuilder.moveItem({
          fromSource: 0,
          from: this.state.selectedView.tile,
          toSource: this.client.containerId,
        }));
      }

      // Alt to use hand on item.
      if (e.key === 'Alt' && this.state.selectedView.tile) {
        Helper.useHand(this.state.selectedView.tile);
      }

      // T to toggle z.
      if (e.key === 't') {
        this.client.connection.send(ProtocolBuilder.move({
          ...focusPos,
          z: 1 - focusPos.z,
        }));
      }
    };

    // resize the canvas to fill browser window dynamically
    const resize = () => {
      const size = Draw.getCanvasSize();
      this.app.renderer.resize(size.width, size.height);
    };
    window.addEventListener('resize', resize);
    resize();

    this.client.eventEmitter.on('ItemMoveBegin', (e: ItemMoveBeginEvent) => {
      this.itemMovingState = e;
      this.mouseHasMovedSinceItemMoveBegin = false;
      world.once('mousemove', () => {
        this.mouseHasMovedSinceItemMoveBegin = true;
      });
    });
    this.client.eventEmitter.on('ItemMoveEnd', (e: ItemMoveEndEvent) => {
      if (!this.itemMovingState) return;

      const from = this.itemMovingState.loc;
      const fromSource = this.itemMovingState.source;
      const to = e.loc;
      const toSource = e.source;
      if (!(fromSource === toSource && equalPoints(from, to))) {
        this.client.connection.send(ProtocolBuilder.moveItem({
          from,
          fromSource,
          to,
          toSource,
        }));
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

    this.client.eventEmitter.on('Action', ContextMenu.close);

    this.client.eventEmitter.on('EditingMode', ({enabled}) => {
      this._isEditing = enabled;
    });

    registerPanelListeners();
  }

  public tick() {
    this.state.elapsedFrames = (this.state.elapsedFrames + 1) % 60000;

    Draw.sweepTexts();

    const focusPos = this.getPlayerPosition();
    const {w, z} = focusPos;
    const partition = this.client.context.map.getPartition(w);

    if (!this._playerCreature) return;
    if (partition.width === 0) return;

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
        const floor = partition.getTile({ x, y, z }).floor;

        let sprite;
        if (floor === WATER) {
          const template = getWaterFloor(partition, { x, y, z });
          sprite = new PIXI.Sprite(Draw.getTexture.templates(template));
        } else if (floor === MINE) {
          const template = getMineFloor(partition, { x, y, z });
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
        const tile = partition.getTile({ x, y, z });
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

          if (tile.creature.tamedBy) {
            const circle = new PIXI.Graphics();
            circle.lineStyle(1, 0x0000FF);
            circle.drawCircle(16, 16, 16);
            creatureSprite.addChild(circle);
          }

          const label = Draw.pooledText(`creature${tile.creature.id}`, tile.creature.name, {
            fill: 'white', stroke: 'black', strokeThickness: 3, lineJoin: 'round', fontSize: 16});
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
      this._currentHoverItemText.text =
        itemUnderMouse.quantity === 1 ? meta.name : `${meta.name} (${itemUnderMouse.quantity})`;
      this._currentHoverItemText.visible = true;
    } else {
      this._currentHoverItemText.visible = false;
    }

    this.containers.world.x = -focusPos.x * 32 + Math.floor(this.app.view.width / 2);
    this.containers.world.y = -focusPos.y * 32 + Math.floor(this.app.view.height / 2);

    this.modules.forEach((clientModule) => clientModule.onTick());

    if (this.isEditingMode()) {
      selectView(null);
    }
  }

  public isOnStage(displayObject: PIXI.DisplayObject) {
    let parent = displayObject.parent;
    while (parent.parent) {
      parent = parent.parent;
    }
    return parent === this.app.stage;
  }
}

export default Game;
