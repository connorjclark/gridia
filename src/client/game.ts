import { OutlineFilter } from '@pixi/filter-outline';
import { MINE, WATER } from '../constants';
import * as Content from '../content';
import { game } from '../game-singleton';
import * as ProtocolBuilder from '../protocol/client-to-server-protocol-builder';
import * as Utils from '../utils';
import Client from './client';
import ClientModule from './client-module';
import * as Draw from './draw';
import { ItemMoveBeginEvent, ItemMoveEndEvent } from './event-emitter';
import * as Helper from './helper';
import KEYS from './keys';
import LazyResourceLoader, { SfxResources } from './lazy-resource-loader';
import { getMineFloor, getWaterFloor } from './template-draw';

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

function addDataToActionEl(actionEl: HTMLElement, opts: { action: GameAction, loc?: TilePoint, creature?: Creature }) {
  actionEl.classList.add('action');
  actionEl.title = opts.action.title;
  actionEl.innerText = opts.action.innerText;
  actionEl.dataset.action = JSON.stringify(opts.action);
  if (opts.loc) actionEl.dataset.loc = JSON.stringify(opts.loc);
  if (opts.creature) actionEl.dataset.creatureId = String(opts.creature.id);
}

function renderSelectedView() {
  const state = game.state;

  let creature;
  if (state.selectedView.creatureId) creature = game.client.context.getCreature(state.selectedView.creatureId);

  let tilePos;
  if (creature) {
    tilePos = creature.pos;
  } else if (state.selectedView.tile) {
    tilePos = state.selectedView.tile;
  }
  const tile = tilePos && game.client.context.map.getTile(tilePos);
  const item = tile?.item;

  let data: Record<string, string>;
  let meta;
  if (creature) {
    data = {
      name: creature.name,
      life: String(creature.life),
      food: String(creature.food),
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

  const el = Helper.find('.selected-view');
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

  if (!tilePos || !tile) return;

  // Clone tile so properties can be removed as needed.
  // Also prevents action creators from modifying important data.
  const clonedTile: Tile = JSON.parse(JSON.stringify(tile));

  if (clonedTile && clonedTile.creature && clonedTile.creature.id === game.client.creatureId) {
    // Don't allow actions on self.
    clonedTile.creature = undefined;
  } else if (creature) {
    // If a creature is selected, do not show actions for the item on the tile.
    clonedTile.item = undefined;
  }

  const actions = game.getActionsFor(clonedTile, tilePos);
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
    const panelName = targetEl.dataset.panel as string;
    targetEl.classList.toggle('panels__tab--active');
    Helper.find('.panel--' + panelName).classList.toggle('panel--active');
    game.client.eventEmitter.emit('panelFocusChanged', { panelName });
  });
}

function selectView(loc: TilePoint) {
  const creature = game.client.context.map.getTile(loc).creature;
  if (creature && creature.id !== game.client.creatureId) {
    // TODO: change selectedView to {tile, loc}
    game.state.selectedView.creatureId = creature.id;
    game.state.selectedView.tile = undefined;
  } else {
    game.state.selectedView.tile = loc;
    game.state.selectedView.creatureId = undefined;
  }

  game.updatePossibleUsages();
  renderSelectedView();
}

function clearSelectedView() {
  game.state.selectedView.tile = undefined;
  game.state.selectedView.creatureId = undefined;
  renderSelectedView();
}

function worldToTile(pw: ScreenPoint) {
  return Utils.worldToTile(Helper.getW(), pw, Helper.getZ());
}

function mouseToWorld(pm: ScreenPoint): ScreenPoint {
  return {
    x: (pm.x + game.state.viewport.x) / game.state.viewport.scale,
    y: (pm.y + game.state.viewport.y) / game.state.viewport.scale,
  };
}

class Game {
  public state: UIState;
  public keys: Record<number, boolean> = {};
  public loader = new LazyResourceLoader();
  protected app = new PIXI.Application();
  protected canvasesEl = Helper.find('#canvases');
  protected world = new PIXI.Container();
  protected layers: Record<string, PIXI.Graphics> = {};
  protected windows: Draw.GridiaWindow[] = [];
  protected itemMovingState?: ItemMoveBeginEvent;
  protected mouseHasMovedSinceItemMoveBegin = false;
  protected modules: ClientModule[] = [];
  protected actionCreators: GameActionCreator[] = [];
  protected possibleUsagesWindow = new Draw.PossibleUsagesWindow();

  private _playerCreature?: Creature;
  private _currentHoverItemText =
    new PIXI.Text('', { fill: 'white', stroke: 'black', strokeThickness: 6, lineJoin: 'round' });
  private _isEditing = false;

  private _animations:
    Array<{frames: GridiaAnimation['frames'], loc: TilePoint, frame: number, nextFrameAt: number}> = [];

  constructor(public client: Client) {
    this.state = {
      viewport: {
        x: 0,
        y: 0,
        scale: 1,
      },
      mouse: {
        x: 0,
        y: 0,
        state: '',
      },
      elapsedFrames: 0,
      selectedView: {},
    };

    PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
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

  // TODO: No action creators use `loc` - remove?
  public getActionsFor(tile: Tile, loc: TilePoint, opts?: { onlyCreature: boolean }): GameAction[] {
    const actions = [];
    const tileToUse = opts?.onlyCreature ? { creature: tile.creature, floor: 0 } : tile;

    for (const actionCreator of this.actionCreators) {
      const action = actionCreator(tileToUse, loc);
      if (Array.isArray(action)) actions.push(...action);
      else if (action) actions.push(action);
    }

    return actions;
  }

  public getPlayerPosition() {
    const creature = this.getPlayerCreature();
    if (creature) return creature.pos;
    return { w: 0, x: 0, y: 0, z: 0 };
  }

  public getPlayerCreature() {
    if (!this._playerCreature) this._playerCreature = this.client.creature;
    return this._playerCreature;
  }

  public async start() {
    // Should only be used for refreshing UI, not updating game state.
    this.client.eventEmitter.on('message', (e) => {
      // Update the selected view, if the item there changed.
      if (e.type === 'setItem') {
        let shouldUpdateUsages = false;
        if (e.args.location.source === 'container') shouldUpdateUsages = true;
        else if (Utils.maxDiff(this.getPlayerPosition(), e.args.location.loc) <= 1) shouldUpdateUsages = true;
        if (shouldUpdateUsages) this.updatePossibleUsages();

        if (e.args.location.source === 'world' && this.state.selectedView.tile) {
          const loc = e.args.location.loc;
          if (Utils.equalPoints(loc, this.state.selectedView.tile)) {
            selectView(this.state.selectedView.tile);
          }
        }
      }

      if (e.type === 'setCreature' && this.state.selectedView.creatureId) {
        const creature = this.client.context.getCreature(this.state.selectedView.creatureId);
        if (creature.id === e.args.id) {
          selectView(creature.pos);
        }
      }
      if (e.type === 'removeCreature' && e.args.id === this.state.selectedView.creatureId) {
        delete this.state.selectedView.creatureId;
        clearSelectedView();
      }
      if (e.type === 'animation') {
        const animationData = Content.getAnimation(e.args.key);
        if (!animationData) throw new Error('no animation found: ' + e.args.key);
        this.addAnimation(animationData, e.args);
      }

      if (e.type === 'chat') {
        const chatTextarea = Helper.find('.chat-area') as HTMLTextAreaElement;
        const isMaxScroll = (chatTextarea.scrollTop + chatTextarea.offsetHeight) >= chatTextarea.scrollHeight;
        chatTextarea.value += `${e.args.from}: ${e.args.message}\n`;
        if (isMaxScroll) chatTextarea.scrollTop = chatTextarea.scrollHeight;
      }
    });

    this.canvasesEl.appendChild(this.app.view);

    // ?
    setTimeout(() => this.onLoad());
  }

  public onLoad() {
    const world = this.world = new PIXI.Container();
    this.app.stage.addChild(world);
    world.addChild(this.layers.floorLayer = new PIXI.Graphics());
    world.addChild(this.layers.itemAndCreatureLayer = new PIXI.Graphics());
    world.addChild(this.layers.topLayer = new PIXI.Graphics());

    this.modules.forEach((clientModule) => clientModule.onStart());

    this.app.ticker.add(this.tick.bind(this));
    this.registerListeners();

    this._currentHoverItemText.x = 0;
    this._currentHoverItemText.y = 0;
    this.app.stage.addChild(this._currentHoverItemText);

    // This makes everything "pop".
    // this.containers.itemAndCreatureLayer.filters = [new OutlineFilter(0.5, 0, 1)];

    this.possibleUsagesWindow.pixiContainer.y = 32 * 2;
    this.possibleUsagesWindow.setOnSelectUsage((possibleUsage) => {
      this.client.connection.send(ProtocolBuilder.use({
        toolIndex: possibleUsage.toolIndex,
        location: possibleUsage.focusLocation,
      }));
    });
    this.addWindow(this.possibleUsagesWindow);
  }

  public async playSound(name: string) {
    if (this.client.settings.volume === 0) return;

    // @ts-ignore
    const resourceKey: string = SfxResources[name];
    if (!this.loader.hasResourceLoaded(resourceKey)) {
      await this.loader.loadResource(resourceKey);
    }
    PIXI.sound.play(resourceKey, { volume: this.client.settings.volume });
  }

  public addAnimation(animation: GridiaAnimation, loc: TilePoint) {
    this._animations.push({frames: animation.frames, loc, frame: 0, nextFrameAt: performance.now() + 100});
    if (animation.frames[0].sound) {
      this.playSound(animation.frames[0].sound);
    }
  }

  public trip() {
    // const filtersBefore = this.layers.itemAndCreatureLayer.filters;
    // const filter = new OutlineFilter(0, 0, 1);
    // const start = performance.now();
    // this.layers.itemAndCreatureLayer.filters = [filter];
    // const handle = setInterval(() => {
    //   const multiplier = 0.5 + Math.cos((performance.now() - start) / 1000) / 2;
    //   filter.thickness = 2 + multiplier * 3;
    // }, 100);
    // setTimeout(() => {
    //   clearInterval(handle);
    //   this.layers.itemAndCreatureLayer.filters = filtersBefore;
    // }, 1000 * 10);
  }

  public addWindow(window: Draw.GridiaWindow) {
    this.windows.push(window);
    this.app.stage.addChild(window.pixiContainer);
  }

  public removeWindow(window: Draw.GridiaWindow) {
    this.windows.splice(this.windows.indexOf(window), 1);
    this.app.stage.removeChild(window.pixiContainer);
  }

  public registerListeners() {
    const onActionSelection = (e: Event) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (!e.target.classList.contains('action')) return;

      const dataset = e.target.dataset;
      // @ts-ignore
      const action: GameAction = JSON.parse(dataset.action);
      const loc: TilePoint = dataset.loc ? JSON.parse(dataset.loc) : null;
      const creatureId = Number(dataset.creatureId);
      const creature = this.client.context.getCreature(creatureId);
      this.client.eventEmitter.emit('action', {
        action,
        loc,
        creature,
      });
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
        this.client.eventEmitter.emit('mouseMovedOverTile', { ...loc });
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

    // TODO: touch doesn't really work well.
    let longTouchTimer: NodeJS.Timeout | null = null;
    this.canvasesEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (longTouchTimer) return;
      longTouchTimer = setTimeout(() => {
        const touch = e.targetTouches.item(0);
        if (!touch) return;
        const mouse = { x: touch.pageX, y: touch.pageY };
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

    this.world.interactive = true;
    this.world.on('pointerdown', (e: PIXI.interaction.InteractionEvent) => {
      if (this.isEditingMode()) return;

      const point = worldToTile(mouseToWorld({ x: e.data.global.x, y: e.data.global.y }));
      if (!this.client.context.map.inBounds(point)) return;
      const item = this.client.context.map.getItem(point);
      if (!item || !item.type) return;
      if (!this.state.mouse.tile) return;

      Utils.ItemLocation.World(this.state.mouse.tile);
      this.client.eventEmitter.emit('itemMoveBegin', {
        location: Utils.ItemLocation.World(this.state.mouse.tile),
        item,
      });
    });
    this.world.on('pointerup', (e: PIXI.interaction.InteractionEvent) => {
      if (Utils.equalPoints(this.state.mouse.tile, this.getPlayerPosition())) {
        const evt: ItemMoveEndEvent = {
          location: Utils.ItemLocation.Container(this.client.containerId),
        };
        this.client.eventEmitter.emit('itemMoveEnd', evt);
      } else if (this.state.mouse.tile) {
        const evt: ItemMoveEndEvent = {
          location: Utils.ItemLocation.World(this.state.mouse.tile),
        };
        this.client.eventEmitter.emit('itemMoveEnd', evt);
      }
    });
    this.world.on('pointerdown', (e: PIXI.interaction.InteractionEvent) => {
      if (ContextMenu.isOpen()) {
        ContextMenu.close();
        return;
      }

      const loc = worldToTile(mouseToWorld({ x: e.data.global.x, y: e.data.global.y }));

      if (!this.isEditingMode()) {
        selectView(loc);
      }

      if (this.client.context.map.inBounds(loc)) {
        this.client.eventEmitter.emit('tileClicked', { ...loc });
      }
    });

    const canvases = Helper.find('#canvases');
    canvases.focus();
    canvases.addEventListener('keydown', (e) => {
      this.keys[e.keyCode] = true;
    });

    canvases.addEventListener('keyup', (e) => {
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
          from: Utils.ItemLocation.World(this.state.selectedView.tile),
          to: Utils.ItemLocation.Container(this.client.containerId),
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
    });

    // resize the canvas to fill browser window dynamically
    const resize = () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight - Helper.find('.ui').clientHeight);
      // this.state.viewport.scale =
      //   navigator.userAgent.includes('Mobile') || navigator.userAgent.includes('Android') ? 2 : 1;
    };
    window.addEventListener('resize', resize);
    resize();

    this.client.eventEmitter.on('itemMoveBegin', (e: ItemMoveBeginEvent) => {
      this.itemMovingState = e;
      this.mouseHasMovedSinceItemMoveBegin = false;
      this.world.once('mousemove', () => {
        this.mouseHasMovedSinceItemMoveBegin = true;
      });
    });
    this.client.eventEmitter.on('itemMoveEnd', (e: ItemMoveEndEvent) => {
      if (!this.itemMovingState) return;

      const from = this.itemMovingState.location;
      const to = e.location;
      if (!Utils.ItemLocation.Equal(from, to)) {
        this.client.connection.send(ProtocolBuilder.moveItem({
          from,
          to,
        }));
      }

      this.itemMovingState = undefined;
    });

    this.client.eventEmitter.on('containerWindowSelectedIndexChanged', () => {
      renderSelectedView();
      this.updatePossibleUsages();
    });

    this.client.eventEmitter.on('playerMove', (e) => {
      if (!this.state.selectedView.creatureId) clearSelectedView();
      ContextMenu.close();
      this.updatePossibleUsages(e.to);
    });

    this.client.eventEmitter.on('action', ContextMenu.close);

    this.client.eventEmitter.on('editingMode', ({ enabled }) => {
      this._isEditing = enabled;
    });

    // this.client.eventEmitter.on('mouseMovedOverTile', (loc) => {
    //  const tile = this.client.context.map.getTile(loc);
    //  if (!tile.creature) return;
    // });

    const chatInput = Helper.find('.chat-input') as HTMLInputElement;
    const chatForm = Helper.find('.chat-form');
    const chatTextarea = Helper.find('.chat-area');
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!chatInput.value) return;

      this.client.connection.send(ProtocolBuilder.chat({
        to: 'global',
        message: chatInput.value,
      }));
      chatInput.value = '';
      chatTextarea.scrollTop = chatTextarea.scrollHeight;
    });

    registerPanelListeners();
  }

  public updatePossibleUsages(center?: TilePoint) {
    this.possibleUsagesWindow.setPossibleUsages(this.getPossibleUsages(center));
  }

  // TODO: better comment. maybe some bullet points. mhm.
  // If item is selected in world, only return usages that use that item as the focus.
  // Else show all usages possible using any tool on any item in inventory or nearby in the world.
  // If a usage is possible with distinct items (example: standing near many trees with an axe),
  // only the first instance will be recorded.
  // If a tool in the inventory is selected, filter results to just usages that use that tool.
  // If a an item in the world is selected, filter results to just usages that use that tool.
  public getPossibleUsages(center?: TilePoint): PossibleUsage[] {
    center = center || this.getPlayerCreature().pos;
    const selectedTool = Helper.getSelectedTool();
    const selectedTile = this.state.selectedView.tile;

    const possibleUsageActions: PossibleUsage[] = [];
    const inventory = this.client.inventory;
    if (!inventory) return [];

    const nearbyItems: Array<{ loc: TilePoint, item?: Item }> = [];
    this.client.context.map.forEach(center, 1, (loc, tile) => {
      // If a tile is selected, limit results to usages on that tile.
      if (selectedTile && !Utils.equalPoints(selectedTile, loc)) return;

      nearbyItems.push({ loc, item: tile.item });
    });

    inventory.forEach((tool, toolIndex) => {
      if (selectedTool && selectedTool !== tool) return;

      const possibleUses = Content.getItemUsesForTool(tool.type);
      for (const use of possibleUses) {
        // TODO: dont yet support focus items being in inventory.
        // Only record one, if any, from inventory.
        // const possibleFocusFromInventory = inventory.items.find((item) => item?.type === use.focus);
        // if (possibleFocusFromInventory) {
        //   possibleUsageActions.push({
        //     toolIndex,
        //     use,
        //     focusLocation: Utils.ItemLocation.Container(
        //       this.client.containerId, inventory.items.indexOf(possibleFocusFromInventory)),
        //   });
        // }

        for (const nearbyItem of nearbyItems) {
          if (nearbyItem.item?.type !== use.focus) continue;
          possibleUsageActions.push({
            toolIndex,
            use,
            focusLocation: Utils.ItemLocation.World(nearbyItem.loc),
          });
        }
      }
    });

    // The implicit sort depends on where the player happens to be, and is unstable.
    // Use some arbirtary sorting to keep the results more stable.
    possibleUsageActions.sort((a, b) => {
      return b.use.tool - a.use.tool;
    });

    return possibleUsageActions;
  }

  public tick() {
    this.state.elapsedFrames = (this.state.elapsedFrames + 1) % 60000;

    Draw.sweepTexts();

    const focusPos = this.getPlayerPosition();
    const { w, z } = focusPos;
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
          containerWindow.pixiContainer.y = 0;
        }
      }
    }

    // Draw windows.
    // TODO: This is probably a lot of wasted cycles. UI should be more reactive.
    for (const window of this.windows) {
      window.draw();
    }

    const TILE_SIZE = this.state.viewport.scale * 32;
    this.world.scale.x = this.world.scale.y = this.state.viewport.scale;
    this.world.x = -focusPos.x * TILE_SIZE + Math.floor(this.app.view.width / 2);
    this.world.y = -focusPos.y * TILE_SIZE + Math.floor(this.app.view.height / 2);

    this.state.viewport.x = focusPos.x * TILE_SIZE - this.app.view.width / 2;
    this.state.viewport.y = focusPos.y * TILE_SIZE - this.app.view.height / 2;

    const tilesWidth = Math.ceil(this.app.view.width / TILE_SIZE);
    const tilesHeight = Math.ceil(this.app.view.height / TILE_SIZE);
    const startTileX = Math.floor(this.state.viewport.x / TILE_SIZE);
    const startTileY = Math.floor(this.state.viewport.y / TILE_SIZE);
    const endTileX = startTileX + tilesWidth;
    const endTileY = startTileY + tilesHeight;

    this.layers.floorLayer.clear();
    for (let x = startTileX; x <= endTileX; x++) {
      for (let y = startTileY; y <= endTileY; y++) {
        const floor = partition.getTile({ x, y, z }).floor;

        let template;
        if (floor === WATER) {
          const templateIdx = getWaterFloor(partition, { x, y, z });
          template = Draw.getTexture.templates(templateIdx);
        } else if (floor === MINE) {
          const templateIdx = getMineFloor(partition, { x, y, z });
          template = Draw.getTexture.templates(templateIdx);
        } else {
          template = Draw.getTexture.floors(floor);
        }

        if (template !== PIXI.Texture.EMPTY) {
          this.layers.floorLayer
            .beginTextureFill({ texture: template })
            .drawRect(x * 32, y * 32, 32, 32)
            .endFill();
        }
      }
    }

    this.layers.itemAndCreatureLayer.clear();
    this.layers.itemAndCreatureLayer.removeChildren();
    for (let x = startTileX; x <= endTileX; x++) {
      for (let y = startTileY; y <= endTileY; y++) {
        const tile = partition.getTile({ x, y, z });
        if (tile.item) {
          const template = Draw.makeItemTemplate(tile.item);
          if (template !== PIXI.Texture.EMPTY) {
            this.layers.itemAndCreatureLayer
              .beginTextureFill({ texture: template })
              .drawRect(x * 32, y * 32, 32, 32)
              .endFill();

            if (tile.item.quantity !== 1) {
              const qty = Draw.makeItemQuantity(tile.item.quantity);
              // Wrap in a container because text field are memoized and so their
              // x,y values should never be modified.
              const ctn = new PIXI.Container();
              ctn.addChild(qty);
              ctn.x = x * 32;
              ctn.y = y * 32;
              this.layers.itemAndCreatureLayer.addChild(ctn);
            }
          }
        }

        if (tile.creature) {
          const template = Draw.getTexture.creatures(tile.creature.image);
          if (template !== PIXI.Texture.EMPTY) {
            const creatureGfx = new PIXI.Graphics();
            creatureGfx.x = x * 32;
            creatureGfx.y = y * 32;

            creatureGfx
              .beginTextureFill({ texture: template })
              .drawRect(0, 0, 32, 32)
              .endFill();

            if (tile.creature.tamedBy) {
              creatureGfx
                .lineStyle(1, 0x0000FF)
                .drawCircle(16, 16, 16)
                .lineStyle();
            }

            if (tile.creature !== this._playerCreature && Utils.equalPoints(this.state.mouse.tile, tile.creature.pos)) {
              const GRAY = 0x606060;
              const BLUE = 0x000088;
              const RED = 0x880000;
              const color = [GRAY, BLUE, RED][tile.creature.id % 3]; // TODO: base on enemy/neutral/good
              creatureGfx.filters = [new OutlineFilter(2, color, 1)];
            }

            this.layers.itemAndCreatureLayer.addChild(creatureGfx);
          }

          // const label = Draw.pooledText(`creature${tile.creature.id}`, tile.creature.name, {
          //   fill: 'white', stroke: 'black', strokeThickness: 3, lineJoin: 'round', fontSize: 16});
          // label.anchor.x = 0.5;
          // label.anchor.y = 1;
          // creatureSprite.addChild(label);
        }
      }
    }

    this.layers.topLayer.clear();
    this.layers.topLayer.removeChildren();

    const now = performance.now();
    for (const animation of this._animations) {
      if (now >= animation.nextFrameAt) {
        animation.nextFrameAt = now + 100;
        animation.frame += 1;

        if (animation.frame >= animation.frames.length) {
          this._animations.splice(this._animations.indexOf(animation), 1);
          continue;
        }

        if (animation.frames[animation.frame].sound) {
          this.playSound(animation.frames[animation.frame].sound);
        }
      }

      const template = Draw.getTexture.animations(animation.frames[animation.frame].sprite);
      this.layers.topLayer
        .beginTextureFill({ texture: template })
        .drawRect(animation.loc.x * 32, animation.loc.y * 32, 32, 32)
        .endFill();
    }

    // Draw item being moved.
    if (this.itemMovingState && this.mouseHasMovedSinceItemMoveBegin && this.itemMovingState.item) {
      // TODO: why doesn't this work?
      // const template = Draw.makeItemTemplate(this.itemMovingState.item);
      // const { x, y } = mouseToWorld(this.state.mouse);
      // this.layers.topLayer
      //   .beginTextureFill(template)
      //   .drawRect(x, y, 32, 32)
      //   .endFill();

      const itemSprite = Draw.makeItemSprite(this.itemMovingState.item);
      const { x, y } = mouseToWorld(this.state.mouse);
      itemSprite.x = x - 16;
      itemSprite.y = y - 16;
      this.layers.topLayer.addChild(itemSprite);
    }

    // Draw highlight over selected view.
    const selectedViewLoc = this.state.selectedView.creatureId ?
      this.client.context.getCreature(this.state.selectedView.creatureId).pos :
      this.state.selectedView.tile;
    if (selectedViewLoc) {
      const highlight = Draw.makeHighlight(0xffff00, 0.2);
      highlight.x = selectedViewLoc.x * 32;
      highlight.y = selectedViewLoc.y * 32;
      this.layers.topLayer.addChild(highlight);

      // If item is the selected view, draw selected tool if usable.
      if (!this.state.selectedView.creatureId) {
        const tool = Helper.getSelectedTool();
        const selectedItem = this.client.context.map.getItem(selectedViewLoc);
        if (tool && selectedItem && Helper.usageExists(tool.type, selectedItem.type)) {
          const itemSprite = Draw.makeItemSprite({ type: tool.type, quantity: 1 });
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

    this.modules.forEach((clientModule) => clientModule.onTick());

    if (this.isEditingMode()) {
      clearSelectedView();
    }
  }

  public isOnStage(displayObject: PIXI.DisplayObject) {
    let parent = displayObject.parent;
    while (parent && parent.parent) {
      parent = parent.parent;
    }
    return parent === this.app.stage;
  }
}

export default Game;
