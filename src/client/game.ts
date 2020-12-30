import { GFX_SIZE } from '../constants';
import * as Content from '../content';
import { game } from '../game-singleton';
import { calcStraightLine } from '../lib/line';
import * as ProtocolBuilder from '../protocol/client-to-server-protocol-builder';
import * as Utils from '../utils';
import Client from './client';
import * as Draw from './draw';
import { ItemMoveBeginEvent, ItemMoveEndEvent } from './event-emitter';
import * as Helper from './helper';
import KEYS from './keys';
import LazyResourceLoader, { SfxResources } from './lazy-resource-loader';
import AdminModule from './modules/admin-module';
import MovementModule from './modules/movement-module';
import SelectedViewModule from './modules/selected-view-module';
import SettingsModule from './modules/settings-module';
import SkillsModule from './modules/skills-module';
import UsageModule from './modules/usage-module';
import { WorldContainer } from './world-container';
import MapModule from './modules/map-module';

// WIP lighting shaders.

const vertexCode = `#version 300 es
in vec2 aVertexPosition;
in vec2 aTextureCoord;

uniform mat3 projectionMatrix;

out vec2 vTextureCoord;

void main(void){
  gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
  vTextureCoord = aTextureCoord;
}
`;

// // http://alex-charlton.com/posts/Dithering_on_the_GPU/
const fragmentCode = `#version 300 es

precision mediump float;

uniform sampler2D uSampler;
in vec2 vTextureCoord;
uniform float time;
out vec4 fragColor;

const int indexMatrix4x4[16] = int[](0,  8,  2,  10,
                                    12, 4,  14, 6,
                                    3,  11, 1,  9,
                                    15, 7,  13, 5);
void main () {
  vec4 sampled_color = texture(uSampler, vTextureCoord);

  int x = int(gl_FragCoord.x) % 4;
  int y = int(gl_FragCoord.y) % 4;
  float val = float(indexMatrix4x4[(x + y * 4)]) / 16.0;

  float threshold = 0.0 + float(int(time) % 15);
  if (val >= threshold / 16.0) {
    fragColor = sampled_color;
  } else {
    fragColor = vec4(0,0,0,1);
  }
}
`;

const uniforms = {
  time: 0,
  // color: 0xFF0000,
};
// eslint-disable-next-line
const testFilter = new PIXI.Filter(vertexCode, fragmentCode, uniforms);

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
    contextMenuEl.style.left = `${screen.x}px`;
    contextMenuEl.style.top = `${screen.y}px`;

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
      game.addDataToActionEl(actionEl, {
        action,
        loc,
        creature: tile.creature,
      });
      contextMenuEl.appendChild(actionEl);
    }
  },
};

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

function worldToTile(pw: ScreenPoint) {
  return Utils.worldToTile(Helper.getW(), pw, Helper.getZ());
}

function mouseToWorld(pm: ScreenPoint): ScreenPoint {
  return game.worldContainer.toLocal(pm);
}

class CreatureSprite extends PIXI.Sprite {
  public constructor(public creature: Creature) {
    super();
  }

  public get tileWidth() {
    return this.creature.image_type || 1;
  }

  public get tileHeight() {
    return this.creature.image_type || 1;
  }

  public tick() {
    if (this.children.length === 0) {
      this.drawCreature();
      return;
    }

    const isPlayer = this.creature.id === game.client.player.creature.id;
    if (!isPlayer && Utils.equalPoints(game.state.mouse.tile, this.creature.pos)) {
      const GRAY = 0x606060;
      const BLUE = 0x000088;
      const RED = 0x880000;
      const color = [GRAY, BLUE, RED][this.creature.id % 3]; // TODO: base on enemy/neutral/good
      this.setOutline(color);
    } else {
      this.setOutline();
    }
  }

  private drawCreature() {
    const width = this.tileWidth;
    const height = this.tileHeight;
    const texture = Draw.getTexture.creatures(this.creature.image, width, height);
    if (texture === PIXI.Texture.EMPTY) return;

    const creatureGfx = new PIXI.Graphics();

    creatureGfx
      .beginTextureFill({ texture })
      .drawRect(0, 0, width * GFX_SIZE, height * GFX_SIZE)
      .endFill();

    // TODO fix this.
    if (this.creature.tamedBy) {
      creatureGfx
        .lineStyle(1, 0x0000FF)
        .drawCircle(GFX_SIZE / 2, GFX_SIZE / 2, GFX_SIZE / 2)
        .lineStyle();
    }

    // uniforms.time = now / 1000;
    // filters.push(testFilter);

    this.removeChildren();
    this.addChild(creatureGfx);
  }

  private setOutline(color?: number) {
    const gfx = this.children[0] as PIXI.Graphics;
    const filters = [];
    if (color !== undefined) {
      filters.push(new PIXI.OutlineFilter(2, color, 1));
    }
    gfx.filters = filters;
  }
}

class Game {
  public state: UIState;
  public keys: Record<number, boolean> = {};
  public loader = new LazyResourceLoader();
  public modules = {
    movement: new MovementModule(this),
    selectedView: new SelectedViewModule(this),
    settings: new SettingsModule(this),
    map: new MapModule(this),
    skills: new SkillsModule(this),
    usage: new UsageModule(this),
  };

  public worldContainer: WorldContainer;
  protected app = new PIXI.Application();
  protected canvasesEl = Helper.find('#canvases');
  protected world = new PIXI.Container();
  protected windows: Draw.GridiaWindow[] = [];
  protected itemMovingState?: ItemMoveBeginEvent;
  protected mouseHasMovedSinceItemMoveBegin = false;
  protected actionCreators: GameActionCreator[] = [];

  protected creatureSprites = new Map<number, CreatureSprite>();

  private _playerCreature?: Creature;
  private _currentHoverItemText =
  new PIXI.Text('', { fill: 'white', stroke: 'black', strokeThickness: 6, lineJoin: 'round' });
  private _isEditing = false;

  private _soundCache: Record<string, PIXI.sound.Sound> = {};

  public constructor(public client: Client) {
    this.state = {
      mouse: {
        x: 0,
        y: 0,
        state: '',
      },
      elapsedFrames: 0,
      selectedView: {
        actions: [],
      },
    };

    this.worldContainer = new WorldContainer(client.context.map);

    PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

    if (client.player.isAdmin) {
      // @ts-ignore
      this.modules.admin = new AdminModule(this);
    } else {
      // TODO: AdminClientModule should create the panel. Until then, manually remove panel.
      Helper.find('.panels__tab[data-panel="admin"]').remove();
    }
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

  public start() {
    // Should only be used for refreshing UI, not updating game state.
    this.client.eventEmitter.on('message', (e) => {
      // Update the selected view, if the item there changed.
      if (e.type === 'setItem') {
        let shouldUpdateUsages = false;
        if (e.args.location.source === 'container') shouldUpdateUsages = true;
        else if (Utils.maxDiff(this.getPlayerPosition(), e.args.location.loc) <= 1) shouldUpdateUsages = true;
        if (shouldUpdateUsages) this.modules.usage.updatePossibleUsages();

        if (e.args.location.source === 'world' && this.state.selectedView.tile) {
          const loc = e.args.location.loc;
          if (Utils.equalPoints(loc, this.state.selectedView.tile)) {
            this.modules.selectedView.selectView(this.state.selectedView.tile);
          }
        }
      }

      if (e.type === 'setCreature' && this.state.selectedView.creatureId) {
        const creature = this.client.context.getCreature(this.state.selectedView.creatureId);
        if (creature.id === e.args.id) {
          this.modules.selectedView.selectView(creature.pos);
        }
      }
      if (e.type === 'removeCreature' && e.args.id === this.state.selectedView.creatureId) {
        delete this.state.selectedView.creatureId;
        this.modules.selectedView.clearSelectedView();
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

    world.addChild(this.worldContainer);

    // this.world.filters = [];
    // this.world.filters.push(testFilter);

    for (const module of Object.values(this.modules)) {
      module.onStart();
    }

    this.app.ticker.add(this.tick.bind(this));
    this.registerListeners();

    this.app.stage.addChild(this._currentHoverItemText);

    // This makes everything "pop".
    // this.containers.itemAndCreatureLayer.filters = [new OutlineFilter(0.5, 0, 1)];
  }
  public playSound(name: string) {
    if (this.client.settings.volume === 0) return;

    if (!this._soundCache[name]) {
      const resourceKey = SfxResources[name];
      this._soundCache[name] = PIXI.sound.Sound.from(resourceKey);
    }

    void this._soundCache[name].play({ volume: this.client.settings.volume });
  }

  public addAnimation(animation: GridiaAnimation, loc: TilePoint) {
    this.worldContainer.animationController.addAnimation({
      location: loc,
      tint: 0,
      alpha: 1,
      decay: 0.1,
      light: 4,
      frames: animation.frames,
    });
  }

  public trip() {
    // const filtersBefore = this.layers.itemAndCreature.filters;
    // const filter = new OutlineFilter(0, 0, 1);
    // const start = performance.now();
    // this.layers.itemAndCreature.filters = [filter];
    // const handle = setInterval(() => {
    //   const multiplier = 0.5 + Math.cos((performance.now() - start) / 1000) / 2;
    //   filter.thickness = 2 + multiplier * 3;
    // }, 100);
    // setTimeout(() => {
    //   clearInterval(handle);
    //   this.layers.itemAndCreature.filters = filtersBefore;
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
      const action = JSON.parse(dataset.action) as GameAction;
      const loc = dataset.loc ? JSON.parse(dataset.loc) as TilePoint : null;
      const creatureId = Number(dataset.creatureId);
      const creature = this.client.context.getCreature(creatureId);
      // @ts-ignore TODO
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

    this.canvasesEl.addEventListener('pointerdown', () => {
      this.state.mouse = {
        ...this.state.mouse,
        state: 'down',
        downTile: this.state.mouse.tile,
      };
    });

    this.canvasesEl.addEventListener('pointerup', () => {
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
    this.world.on('pointerdown', (e: PIXI.InteractionEvent) => {
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
    this.world.on('pointerup', () => {
      if (Utils.equalPoints(this.state.mouse.tile, this.getPlayerPosition())) {
        this.client.eventEmitter.emit('itemMoveEnd', {
          location: Utils.ItemLocation.Container(this.client.player.containerId),
        });
      } else if (this.state.mouse.tile) {
        this.client.eventEmitter.emit('itemMoveEnd', {
          location: Utils.ItemLocation.World(this.state.mouse.tile),
        });
      }
    });
    this.world.on('pointerdown', (e: PIXI.InteractionEvent) => {
      if (ContextMenu.isOpen()) {
        ContextMenu.close();
        return;
      }

      const loc = worldToTile(mouseToWorld({ x: e.data.global.x, y: e.data.global.y }));

      if (!this.isEditingMode()) {
        this.modules.selectedView.selectView(loc);
      }

      if (this.client.context.map.inBounds(loc)) {
        this.client.eventEmitter.emit('tileClicked', { ...loc });
      }

      // Temporary.
      const graphics = Math.random() > 0.5 ? { graphic: 60, graphicFrames: 10 } : { graphic: 80, graphicFrames: 5 };
      const frames: GridiaAnimation['frames'] =
        Utils.emptyArray(graphics.graphicFrames).map((_, i) => ({ sprite: graphics.graphic + i }));
      frames[0].sound = 'magic';

      this.worldContainer.animationController.addEmitter({
        tint: 0x000055,
        path: calcStraightLine(this.worldContainer.camera.focus, loc).reverse(),
        light: 4,
        offshootRate: 0.2,
        frames,
      });
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
      const inventoryWindow = Draw.getContainerWindow(this.client.player.containerId);

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
        this.modules.selectedView.selectView(currentCursor);
      }

      // Space bar to use tool.
      if (e.keyCode === KEYS.SPACE_BAR && this.state.selectedView.tile) {
        Helper.useTool(this.state.selectedView.tile);
      }

      // Shift to pick up item.
      if (e.keyCode === KEYS.SHIFT && this.state.selectedView.tile) {
        this.client.connection.send(ProtocolBuilder.moveItem({
          from: Utils.ItemLocation.World(this.state.selectedView.tile),
          to: Utils.ItemLocation.Container(this.client.player.containerId),
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
      this.modules.selectedView.renderSelectedView();
      this.modules.usage.updatePossibleUsages();
    });

    this.client.eventEmitter.on('playerMove', (e) => {
      if (!this.state.selectedView.creatureId) this.modules.selectedView.clearSelectedView();
      ContextMenu.close();
      this.modules.usage.updatePossibleUsages(e.to);
    });

    this.client.eventEmitter.on('action', () => ContextMenu.close());

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

  public tick() {
    const now = performance.now();
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
        if (id === this.client.player.containerId) {
          containerWindow.draw();
          containerWindow.pixiContainer.y = this.app.view.height - containerWindow.height - containerWindow.borderSize;
        }
      }
    }

    // Draw windows.
    // TODO: This is probably a lot of wasted cycles. UI should be more reactive.
    for (const window of this.windows) {
      window.draw();
    }

    const tilesWidth = Math.ceil(this.app.view.width / GFX_SIZE);
    const tilesHeight = Math.ceil(this.app.view.height / GFX_SIZE);

    this.worldContainer.camera.width = tilesWidth;
    this.worldContainer.camera.height = tilesHeight;
    this.worldContainer.camera.adjustFocus(this.getPlayerPosition());
    this.worldContainer.tick();

    this.worldContainer.layers.grid.alpha = this.client.settings.showGrid ? 1 : 0;

    const startTileX = this.worldContainer.camera.left;
    const startTileY = this.worldContainer.camera.top;

    // These layers are constantly cleared and redrawn in the game loop.
    const layersManagedByGameLoop = [
      this.worldContainer.layers.top,
    ];

    // Transient graphics objects must be destroyed to prevent memory leaks.
    for (const layer of layersManagedByGameLoop) {
      for (const child of layer.children) {
        if (child instanceof PIXI.Graphics) {
          child.destroy();
        }
      }
      layer.removeChildren();
    }

    const creatureSpritesNotSeen = new Set([...this.creatureSprites.keys()]);

    const start = { x: startTileX, y: startTileY, z };
    for (const { pos, tile } of partition.getIteratorForArea(start, tilesWidth + 1, tilesHeight + 1)) {
      const { x, y } = pos;

      // TODO: don't make creature sprites on every tick.
      if (tile.creature) {
        creatureSpritesNotSeen.delete(tile.creature.id);

        let creatureSprite = this.creatureSprites.get(tile.creature.id);
        if (!creatureSprite) {
          creatureSprite = new CreatureSprite(tile.creature);
          this.creatureSprites.set(tile.creature.id, creatureSprite);
          this.worldContainer.layers.creatures.addChild(creatureSprite);
        }

        creatureSprite.x = x * GFX_SIZE;
        creatureSprite.y = (y - creatureSprite.tileHeight + 1) * GFX_SIZE;
        // Ensure creature is always over an item on the same tile.
        creatureSprite.zIndex = y + 0.1;
        creatureSprite.tick();

        // const label = Draw.pooledText(`creature${tile.creature.id}`, tile.creature.name, {
        //   fill: 'white', stroke: 'black', strokeThickness: 3, lineJoin: 'round', fontSize: 16});
        // label.anchor.x = 0.5;
        // label.anchor.y = 1;
        // creatureSprite.addChild(label);
      }
    }

    for (const id of creatureSpritesNotSeen) {
      const creatureSprite = this.creatureSprites.get(id);
      if (!creatureSprite) continue;

      this.creatureSprites.delete(id);
      if (creatureSprite.parent) creatureSprite.parent.removeChild(creatureSprite);
      creatureSprite.destroy();
    }

    // Draw item being moved.
    if (this.itemMovingState && this.mouseHasMovedSinceItemMoveBegin && this.itemMovingState.item) {
      const itemSprite = Draw.makeItemSprite(this.itemMovingState.item);
      const { x, y } = mouseToWorld(this.state.mouse);
      itemSprite.x = x - GFX_SIZE / 2;
      itemSprite.y = y - GFX_SIZE / 2;
      this.worldContainer.layers.top.addChild(itemSprite);
    }

    // Draw highlight over selected view.
    const selectedViewLoc = this.state.selectedView.creatureId ?
      this.client.context.getCreature(this.state.selectedView.creatureId).pos :
      this.state.selectedView.tile;
    if (selectedViewLoc) {
      const highlight = Draw.makeHighlight(0xffff00, 0.2);
      highlight.x = selectedViewLoc.x * GFX_SIZE;
      highlight.y = selectedViewLoc.y * GFX_SIZE;
      this.worldContainer.layers.top.addChild(highlight);

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

    // Draw name of item.
    const itemUnderMouse = this.state.mouse.tile && this.client.context.map.getItem(this.state.mouse.tile);
    if (itemUnderMouse) {
      const meta = Content.getMetaItem(itemUnderMouse.type);
      this._currentHoverItemText.text =
        itemUnderMouse.quantity === 1 ? meta.name : `${meta.name} (${itemUnderMouse.quantity})`;
      this._currentHoverItemText.visible = true;
      this._currentHoverItemText.anchor.x = 1;
      this._currentHoverItemText.anchor.y = 1;
      this._currentHoverItemText.x = this.app.view.width - GFX_SIZE * 0.3;
      this._currentHoverItemText.y = this.app.view.height;
    } else {
      this._currentHoverItemText.visible = false;
    }

    for (const clientModule of Object.values(this.modules)) {
      clientModule.onTick(now);
    }

    if (this.isEditingMode()) {
      this.modules.selectedView.clearSelectedView();
    }
  }

  public isOnStage(displayObject: PIXI.DisplayObject) {
    let parent = displayObject.parent;
    while (parent && parent.parent) {
      parent = parent.parent;
    }
    return parent === this.app.stage;
  }

  public addDataToActionEl(actionEl: HTMLElement, opts: { action: GameAction; loc?: TilePoint; creature?: Creature }) {
    actionEl.classList.add('action');
    actionEl.title = opts.action.title;
    actionEl.innerText = opts.action.innerText;
    actionEl.dataset.action = JSON.stringify(opts.action);
    if (opts.loc) actionEl.dataset.loc = JSON.stringify(opts.loc);
    if (opts.creature) actionEl.dataset.creatureId = String(opts.creature.id);
  }
}

export default Game;
