import {DateTime, Duration} from 'luxon';

import {GFX_SIZE} from '../constants.js';
import * as Content from '../content.js';
import {game} from '../game-singleton.js';
import {calcStraightLine} from '../lib/line.js';
import * as CommandBuilder from '../protocol/command-builder.js';
import {ProtocolEvent} from '../protocol/event-builder.js';
import * as Utils from '../utils.js';

import {Client} from './client.js';
import {reconnectToServer} from './connect-to-server.js';
import {WorkerConnection} from './connection.js';
import * as Draw from './draw.js';
import {ItemMoveBeginEvent, ItemMoveEndEvent} from './event-emitter.js';
import * as Helper from './helper.js';
import {KEYS} from './keys.js';
import {LazyResourceLoader} from './lazy-resource-loader.js';
import {MapModule} from './modules/map-module.js';
import {MovementModule} from './modules/movement-module.js';
import {NotificationsModule} from './modules/notifications-module.js';
import {SelectedViewModule} from './modules/selected-view-module.js';
import {getSettings, SettingsModule} from './modules/settings-module.js';
import {SkillsModule} from './modules/skills-module.js';
import {SoundModule} from './modules/sound-module.js';
import {UsageModule} from './modules/usage-module.js';
import {ServerWorker} from './server-worker.js';
import {makeGraphicComponent} from './ui/components/graphic.js';
import {WindowManager} from './ui/window-manager.js';
import {makeAttributesWindow} from './ui/windows/attributes-window.js';
import {makeContainerWindow} from './ui/windows/container-window.js';
import {makeDialogueWindow} from './ui/windows/dialogue-window.js';
import {makeHelpWindow} from './ui/windows/help-window.js';
import {makeSpellsWindow} from './ui/windows/spells-window.js';
import {makeStoreWindow} from './ui/windows/store-window.js';
import {makeUsageSearchWindow} from './ui/windows/usage-search-window.js';
import {WorldContainer} from './world-container.js';

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

  openForLocation(screen: ScreenPoint, location: ItemLocation) {
    if (location.source !== 'world') return;

    const contextMenuEl = ContextMenu.get();
    contextMenuEl.style.display = 'block';
    contextMenuEl.style.left = `${screen.x}px`;
    contextMenuEl.style.top = `${screen.y}px`;

    contextMenuEl.innerHTML = '';
    const creature = game.client.context.getCreatureAt(location.pos);
    const actions = game.getActionsFor(Utils.ItemLocation.World(location.pos));
    actions.push({
      type: 'cancel',
      innerText: 'Cancel',
      title: '',
    });
    if (game.client.context.walkable(location.pos)) {
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
        location: Utils.ItemLocation.World(location.pos),
        creatureId: creature?.id,
      });
      contextMenuEl.appendChild(actionEl);
    }
  },
};

function worldToTile(pw: ScreenPoint) {
  return Utils.worldToTile(Helper.getW(), pw, Helper.getZ());
}

function mouseToWorld(pm: ScreenPoint): ScreenPoint {
  return game.worldContainer.toLocal(pm);
}

class CreatureSprite extends PIXI.Sprite {
  dirty = false;

  private label = Draw.pooledText(`creature-label-${this.creature.id}`, '', {
    fontSize: 20,
    fill: '#f4f1f1',
    lineJoin: 'bevel',
    miterLimit: 1,
    strokeThickness: 5,
  });
  private labelGfx = new PIXI.Graphics();
  private labelSprite = new PIXI.Sprite();
  private statusTextsEl?: HTMLElement;

  constructor(public creature: Creature) {
    super();

    this.labelSprite.addChild(this.labelGfx);
    this.labelSprite.addChild(this.label);
    this.labelSprite.x = this.labelGfx.x = GFX_SIZE / 2;
    this.label.anchor.set(0.5, 1.0);
  }

  get tileWidth() {
    return this.creature.graphics.width || 1;
  }

  get tileHeight() {
    return this.creature.graphics.height || 1;
  }

  get tileScale() {
    return this.creature.graphics.scale || 1;
  }

  tick() {
    if (this.statusTextsEl) {
      const screenCoords = this.toGlobal({x: GFX_SIZE / 2, y: -GFX_SIZE / 2});
      this.statusTextsEl.style.left = screenCoords.x + 'px';
      this.statusTextsEl.style.bottom = (window.innerHeight - screenCoords.y) + 'px';
    }

    this.labelSprite.transform.scale.set(1 / game.client.settings.scale);

    if (this.children.length === 0 || this.dirty) {
      if (this.drawCreature()) {
        this.dirty = false;
      } else {
        return;
      }
    }

    const isClient = this.creature.id === game.client.creature.id;
    if (!isClient && Utils.equalPoints(game.state.mouse.tile, this.creature.pos)) {
      const GRAY = 0x606060;
      const BLUE = 0x000088;
      const RED = 0x880000;
      const color = [GRAY, BLUE, RED][this.creature.id % 3]; // TODO: base on enemy/neutral/good
      this.setOutline(color);
      this.labelSprite.alpha = 1;
    } else {
      this.setOutline();
      this.labelSprite.alpha = 0;
    }

    if (this.creature.isPlayer) {
      this.labelSprite.alpha = 1;
    }

    if (this.labelSprite.alpha) {
      this.labelGfx.clear();
      if (game.client.settings.labelBackground) {
        this.labelGfx.beginFill(0xFFFFFF, 0.6);
        const rect = {} as PIXI.Rectangle;
        this.label.getLocalBounds(rect);
        this.labelGfx.x = rect.x;
        this.labelGfx.y = rect.y;
        this.labelGfx.drawRect(0, 0, rect.width, rect.height);
        this.labelGfx.endFill();
      }
    }
  }

  addStatusText(opts: { text: string; color?: string; msUntilFade?: number }) {
    if (!this.statusTextsEl) {
      this.statusTextsEl = Helper.createChildOf(document.body, 'div', 'status-texts status-texts--creature');
    }

    const textEl = Helper.createChildOf(this.statusTextsEl, 'div', 'status-text');
    textEl.textContent = opts.text;
    if (opts.color) textEl.style.color = opts.color;
    textEl.style.fontSize = '20px';
    this.statusTextsEl.append(textEl);

    setTimeout(() => textEl.classList.add('status-text--remove'), opts.msUntilFade || 500);
    textEl.addEventListener('transitionend', () => {
      textEl.remove();
      if (this.statusTextsEl && !this.statusTextsEl?.children.length) {
        this.statusTextsEl.remove();
        this.statusTextsEl = undefined;
      }
    }, {once: true});
  }

  // Returns false if textures are not loaded yet.
  private drawCreature() {
    const width = this.tileWidth;
    const height = this.tileHeight;
    const textures: PIXI.Texture[] = [];

    let animatedSprite;
    if (this.creature.graphics.frames.length === 1) {
      textures.push(Draw.getTexture(this.creature.graphics, this.creature.graphics.frames[0]));
    } else {
      const animTextures = this.creature.graphics.frames
        .map((index) => Draw.getTexture(this.creature.graphics, index));
      if (animTextures.some((t) => t === PIXI.Texture.EMPTY)) return;

      animatedSprite = new PIXI.AnimatedSprite(animTextures);
      animatedSprite.animationSpeed = 5 / 60;
      animatedSprite.play();
    }

    if (this.creature.equipmentGraphics) {
      for (const graphic of this.creature.equipmentGraphics) {
        textures.push(Draw.getTexture(graphic, graphic.frames[0]));
      }
    }

    const creatureGfx = new PIXI.Graphics();
    creatureGfx.scale.set(this.tileScale);
    for (const texture of Object.values(textures)) {
      // Missing a necessary texture: bail for now.
      if (texture === PIXI.Texture.EMPTY) return false;

      creatureGfx
        .beginTextureFill({texture})
        .drawRect(0, 0, width * GFX_SIZE, height * GFX_SIZE)
        .endFill();
    }

    if (this.creature.tamedBy) {
      creatureGfx
        .lineStyle(1, 0x0000FF)
        .drawCircle(GFX_SIZE / 2, GFX_SIZE / 2, GFX_SIZE / 2)
        .lineStyle();
    }

    // uniforms.time = now / 1000;
    // filters.push(testFilter);

    this.label.text = this.creature.name;

    this.removeChild(this.labelSprite);
    Draw.destroyChildren(this);
    if (animatedSprite) this.addChild(animatedSprite);
    this.addChild(creatureGfx);
    this.addChild(this.labelSprite);

    this.labelSprite.alpha = 0;

    return true;
  }

  private setOutline(color?: number) {
    const gfx = this.children[0] as PIXI.Graphics;
    const filters = [];
    if (color !== undefined) {
      filters.push(new OutlineFilter(2, color, 1));
    }
    gfx.filters = filters;
  }
}

export interface CursorReference {
  el: HTMLElement;
  location: ItemLocation | null;
  color: string;
  smooth: boolean;
}

export class Game {
  state: UIState;
  keys: Record<number, boolean> = {};
  loader = new LazyResourceLoader();
  started = false;

  windowManager = new WindowManager();
  worldContainer: WorldContainer;
  protected app = new PIXI.Application();
  protected canvasesEl = Helper.find('#canvases');
  protected world = new PIXI.Container();
  protected itemMovingState?: ItemMoveBeginEvent;
  /** Follows the cursor, displaying an item graphic. Used for moving items / click tile mode */
  protected itemCursorGraphic = makeGraphicComponent();
  protected actionCreators: GameActionCreator[] = [];

  protected creatureSprites = new Map<number, CreatureSprite>();
  protected containerWindows = new Map<string, ReturnType<typeof makeContainerWindow>>();
  protected storeWindow?: ReturnType<typeof makeStoreWindow>;
  protected attributesWindow = makeAttributesWindow(this);
  protected chatWindow = this.windowManager.createWindow({
    id: 'chat',
    tabLabel: 'Chat',
    cell: 'bottom__left',
    show: true,
    noscroll: true,
    onInit(el) {
      el.append(Helper.find('.chat'));
    },
  });
  protected dialogueWindow?: ReturnType<typeof makeDialogueWindow>;

  private _eventAbortController = new AbortController();
  private _currentHoverItemText =
  new PIXI.Text('', {fill: 'white', stroke: 'black', strokeThickness: 6, lineJoin: 'round'});
  private _isEditing = false;

  private _cursors: CursorReference[] = [];
  private _mouseCursor = this.registerCursor({color: 'gold', smooth: true});
  private _selectedViewCursor = this.registerCursor({color: 'white'});

  private _currentChatSection = 'All';
  private _chatLog: Array<{ section: string; text: string; from?: string }> = [];
  private _chatMemory: string[] = [];

  modules = {
    admin: null as import('./modules/admin-module.js').AdminModule | null,
    movement: new MovementModule(this),
    selectedView: new SelectedViewModule(this),
    settings: new SettingsModule(this),
    map: new MapModule(this),
    notifications: new NotificationsModule(this),
    skills: new SkillsModule(this),
    sound: new SoundModule(this),
    usage: new UsageModule(this),
  };

  constructor(public client: Client) {
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
      containers: {},
    };

    this.worldContainer = new WorldContainer(client.context.map);

    this.itemCursorGraphic.el.classList.add('moving-item');

    PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

    this.tick = this.tick.bind(this);
  }

  focus() {
    this.canvasesEl.focus();
  }

  async onDisconnect() {
    this.app.ticker.remove(this.tick);
    document.body.classList.add('disconnected');

    for (let i = 0; i < 20; i++) {
      const {status} = await reconnectToServer(this.client);
      if (status === 'success') {
        console.log('reconnected!');
        this.app.ticker.add(this.tick);
        this.worldContainer.map = this.client.context.map;
        document.body.classList.remove('disconnected');
        return;
      } else if (status === 'failure') {
        break;
      } else if (status === 'try-again') {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    this._eventAbortController.abort();
    window.document.body.innerText = 'Lost connection to server. Please refresh.';
  }

  registerCursor(opts: { color: string; smooth?: boolean }): CursorReference {
    const el = Helper.createChildOf(Helper.find('.grid-cursors'), 'div', 'grid-cursor');
    const cursor = {
      el,
      location: null,
      color: opts.color,
      smooth: opts.smooth ?? false,
    };
    this._cursors.push(cursor);
    return cursor;
  }

  isEditingMode() {
    return this._isEditing && this.modules.admin?.window.delegate.isOpen();
  }

  addActionCreator(actionCreator: GameActionCreator) {
    this.actionCreators.push(actionCreator);
  }

  // getActionsFor(location: ItemLocation, opts?: { onlyCreature: boolean }): GameAction[] {
  getActionsFor(location: ItemLocation): GameAction[] {
    const actions = [];
    // TODO: fix this.
    // const tileToUse = opts?.onlyCreature ? { creature: tile.creature, floor: 0 } : tile;

    for (const actionCreator of this.actionCreators) {
      const action = actionCreator(location);
      if (Array.isArray(action)) actions.push(...action);
      else if (action) actions.push(action);
    }

    return actions;
  }

  getPlayerPosition() {
    const creature = this.getPlayerCreature();
    if (creature) return creature.pos;
    return {w: 0, x: 0, y: 0, z: 0};
  }

  getPlayerCreature() {
    return this.client.creature;
  }

  // Should only be used for refreshing UI, not updating game state.
  // Event are guaranteed to be first handled by `client-interface.ts`.
  onProtocolEvent(event: ProtocolEvent) {
    // Update the selected view, if the item there changed.
    if (event.type === 'setItem') {
      let shouldUpdateUsages = false;
      if (event.args.location.source === 'container') shouldUpdateUsages = true;
      else if (Utils.maxDiff(this.getPlayerPosition(), event.args.location.pos) <= 1) shouldUpdateUsages = true;
      if (shouldUpdateUsages) this.modules.usage.updatePossibleUsages();

      if (this.state.selectedView.location &&
        Utils.ItemLocation.Equal(this.state.selectedView.location, event.args.location)) {
        this.modules.selectedView.selectView(this.state.selectedView.location);
      }

      if (event.args.location.source === 'container' && this.containerWindows.has(event.args.location.id)) {
        const container = this.client.context.containers.get(event.args.location.id);
        if (container) {
          // TODO: should only update a single slot ...
          this.containerWindows.get(event.args.location.id)?.actions.setContainer(container);
        }
      }
    }

    if (event.type === 'setCreature' && event.args.id) {
      if (Utils.hasSniffedDataChanged<Creature>(event.args, 'pos')) {
        const cre = this.client.context.creatures.get(event.args.id);
        if (cre) {
          const pos = cre.pos;
          // Update so "selectView" will correctly find this creature.
          // TODO This technically puts the creature in two places at once until the next game loop
          // tick... maybe "selectView" should just accept a location or a creature?
          this.client.context.locationToCreature.set(`${pos.w},${pos.x},${pos.y},${pos.z}`, cre);
        }
      }

      if (this.client.creature.id === event.args.id) {
        this.attributesWindow.actions.setAttribute('life', {...this.client.creature.life});
        this.attributesWindow.actions.setAttribute('stamina', {...this.client.creature.stamina});
        this.attributesWindow.actions.setAttribute('mana', {...this.client.creature.mana});
        this.attributesWindow.actions.setBuffs(this.client.creature.buffs.map((buff) => {
          let name = 'Buff';
          let skillName = '?';
          if (buff.id === 'overburdened') {
            // TODO name should be part of Buff
            skillName = 'All Skills';
            name = 'Overburdened';
          } else if (buff.skill === -1) {
            skillName = 'All Skills';
            name = 'Hero Buff';
          } else if (buff.skill) {
            skillName = Content.getSkill(buff.skill).name;
            name = `${skillName} Buff`;
          } else if (buff.attribute) {
            skillName = buff.attribute;
            name = `${skillName} Buff`;
          }

          return {
            name,
            skillName,
            ...buff,
          };
        }));

        const updateEquipmentWindow =
          Utils.hasSniffedDataChanged<Creature>(event.args, 'stats', 'graphics', 'equipmentGraphics');
        if (this.client.equipment && updateEquipmentWindow) {
          const equipmentWindow = this.containerWindows.get(this.client.equipment.id);
          equipmentWindow?.actions.setEquipmentWindow({
            equipmentGraphics: this.client.creature.equipmentGraphics,
            stats: this.client.creature.stats,
          });
        }

        if (Utils.hasSniffedDataChanged<Creature>(event.args, 'pos')) {
          this.modules.map.getMapWindow().actions.setPos({...this.client.creature.pos});
        }
      }

      if (this.state.selectedView.creatureId === event.args.id) {
        const creature = this.client.context.getCreature(this.state.selectedView.creatureId);
        if (creature.id === event.args.id) {
          this.modules.selectedView.selectView(Utils.ItemLocation.World(creature.pos));
        }
      }

      const justPosUpdate =
        Utils.hasSniffedDataChanged<Creature>(event.args, 'pos') && 'ops' in event.args && event.args.ops.length === 1;
      const creatureSprite = game.creatureSprites.get(event.args.id);
      if (creatureSprite && !justPosUpdate) {
        creatureSprite.dirty = true;
      }
    }
    if (event.type === 'removeCreature' &&
        this.client.session.attackingCreatureId === this.state.selectedView.creatureId) {
      // Disable attack.
      this.client.connection.sendCommand(CommandBuilder.creatureAction({
        type: 'attack',
        creatureId: 0,
      }));
      this.client.session.attackingCreatureId = null;
    }
    if (event.type === 'removeCreature' && event.args.id === this.state.selectedView.creatureId) {
      delete this.state.selectedView.creatureId;
      this.modules.selectedView.clearSelectedView();
    }
    if (event.type === 'animation') {
      const animation = Content.getAnimation(event.args.name);
      if (!animation) throw new Error('no animation found: ' + event.args.name);
      this.addAnimation(event.args);
    }
    if (event.type === 'rawAnimation') {
      this.worldContainer.animationController.addEmitter(event.args);
    }

    if (event.type === 'updateSessionState' && event.args.attackingCreatureId !== undefined) {
      // "Attack" action text may change.
      this.modules.selectedView.renderSelectedView();
    }

    if (event.type === 'chat') {
      this.addToChat(event.args.section, event.args.text, event.args.from);
      if (event.args.creatureId) {
        const creatureSprite = this.creatureSprites.get(event.args.creatureId);
        if (creatureSprite) {
          creatureSprite.addStatusText({
            text: event.args.text,
            msUntilFade: 5000,
          });
        }
      }
    }

    if (event.type === 'creatureStatus') {
      const creatureSprite = game.creatureSprites.get(event.args.creatureId);
      if (creatureSprite) {
        creatureSprite.addStatusText({
          text: event.args.text,
          color: event.args.color,
        });
      }
    }

    // TODO: better window management.
    function closeDialogueWindow() {
      game.dialogueWindow?.delegate.hide();
      game.dialogueWindow = undefined;
      game.client.eventEmitter.removeListener('playerMove', closeDialogueWindow);
    }

    if (event.type === 'startDialogue') {
      if (this.dialogueWindow) {
        closeDialogueWindow();
      } else {
        if (!event.args.dialogue) throw new Error('missing dialogue');

        this.dialogueWindow = makeDialogueWindow(this, {
          index: event.args.index,
          speakers: event.args.speakers,
          dialogue: event.args.dialogue,
          symbols: [...event.args.symbols],
        });
        this.dialogueWindow.delegate.show();
        this.client.eventEmitter.once('playerMove', closeDialogueWindow);
      }
    }

    if (event.type === 'updateDialogue') {
      if (event.args.index === -1) {
        closeDialogueWindow();
        return;
      }

      if (this.dialogueWindow) {
        this.dialogueWindow.actions.setIndex(event.args.index);
        this.dialogueWindow.actions.setSymbols([...event.args.symbols]);
      }
    }

    if (event.type === 'time') {
      this.client._lastSyncedEpoch = event.args.epoch;
      this.client._lastSyncedRealTime = Date.now();
    }
  }

  start() {
    this.client.settings = getSettings(this.client.account.settings || {});

    if (Content.getBaseDir() === 'worlds/bit-world') {
      this.client.settings.scale = 2.25;
    }
    if (Content.getBaseDir() === 'worlds/16bit-world') {
      this.client.settings.scale = 1.75;
    }
    if (Content.getBaseDir() === 'worlds/urizen-world') {
      this.client.settings.scale = 1.75;
    }
    if (Utils.isNarrowViewport()) {
      this.client.settings.scale = 1;
    }

    this.canvasesEl.appendChild(this.app.view);

    this.createChatSection('All');
    this.setChatSection('All');
    this.createChatSection('Global');
    // this.createChatSection('Local');
    this.createChatSection('World');
    this.createChatSection('Combat');
    this.createChatSection('Skills');

    if (this.client.player.isAdmin) {
      // TODO: code split the AdminWindow portion of this.
      import('./modules/admin-module.js').then(({AdminModule}) => {
        this.modules.admin = new AdminModule(this);
        // ?
        setTimeout(() => this.onLoad());
      });
    } else {
      // ?
      setTimeout(() => this.onLoad());
    }
  }

  onLoad() {
    const world = this.world = new PIXI.Container();
    this.app.stage.addChild(world);

    world.addChild(this.worldContainer);

    // this.world.filters = [];
    // this.world.filters.push(testFilter);

    for (const module of Object.values(this.modules)) {
      module?.onStart();
    }

    this.app.ticker.add(this.tick);

    makeHelpWindow(this);
    makeUsageSearchWindow(this);
    makeSpellsWindow((spell) => {
      const creatureId = this.state.selectedView.creatureId;
      let pos;
      if (spell.target === 'world' && !creatureId) {
        if (this.state.selectedView.location?.source === 'world') {
          pos = this.state.selectedView.location.pos;
        } else {
          pos = this.client.creature.pos;
        }
      }

      this.client.connection.sendCommand(CommandBuilder.castSpell({id: spell.id, creatureId, pos}));
    });

    this.registerListeners();

    this.app.stage.addChild(this._currentHoverItemText);

    // This makes everything "pop".
    // this.containers.itemAndCreatureLayer.filters = [new OutlineFilter(0.5, 0, 1)];

    // Server sends some events before the client is ready. Process them now.
    this.started = true;
    for (const event of this.client.storedEvents) {
      this.onProtocolEvent(event);
    }
    this.client.storedEvents = [];

    this.focus();
  }

  addAnimation(animationInstance: GridiaAnimationInstance) {
    const animation = Content.getAnimation(animationInstance.name);

    // TODO
    let light = 0;
    if (['WarpIn', 'WarpOut', 'LevelUp', 'Lightning', 'Burning'].includes(animationInstance.name)) {
      light = 4;
    }

    if (animationInstance.path.length === 1) {
      this.worldContainer.animationController.addAnimation({
        location: animationInstance.path[0],
        tint: 0,
        alpha: 1,
        decay: 0.1,
        light,
        frames: animation?.frames,
        directionalFrames: animation?.directionalFrames,
      });
    } else {
      this.worldContainer.animationController.addEmitter({
        tint: 0,
        path: animationInstance.path,
        frames: animation?.frames,
        directionalFrames: animation?.directionalFrames,
      });
    }
  }

  trip() {
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

  registerClientEventListeners() {
    this.client.eventEmitter.on('event', (e) => {
      if (this.started) this.onProtocolEvent(e);
    });

    this.client.eventEmitter.on('itemMoveBegin', (e: ItemMoveBeginEvent) => {
      if (!e.item) return;

      this.exitClickTileMode();
      this.itemMovingState = e;
      const metaItem = Content.getMetaItem(e.item.type);
      this.itemCursorGraphic.setState({
        graphic: {
          file: metaItem.graphics.file,
          index: metaItem.graphics.frames[0],
        },
      });
    });
    this.client.eventEmitter.on('itemMoveEnd', (e: ItemMoveEndEvent) => {
      if (!this.itemMovingState) return;

      const from = this.itemMovingState.location;
      const to = e.location;
      if (!Utils.ItemLocation.Equal(from, to)) {
        this.client.connection.sendCommand(CommandBuilder.moveItem({
          from,
          // When moving an item to an equipment container, delete the index so that `findValidLocation`
          // will select the correct index in the container to move the item to (if any). This makes
          // equipping items by dragging them to the equipment window much simpler.
          to: to.source === 'container' && to.id === this.client.equipment?.id ?
            {...to, index: undefined} :
            to,
        }));
      }

      this.itemMovingState = undefined;
      this.itemCursorGraphic.setState({
        graphic: undefined,
      });
    });

    this.client.eventEmitter.on('containerWindowSelectedIndexChanged', () => {
      this.modules.selectedView.renderSelectedView();
      this.modules.usage.updatePossibleUsages();
    });

    this.client.eventEmitter.on('playerMove', (e) => {
      if (!this.state.selectedView.creatureId) this.modules.selectedView.clearSelectedView();
      ContextMenu.close();
      this.modules.usage.updatePossibleUsages(e.to);
      this.itemMovingState = undefined;
      this._mouseCursor.location = null;
    });

    this.client.eventEmitter.on('action', () => ContextMenu.close());

    this.client.eventEmitter.on('editingMode', ({enabled}) => {
      this._isEditing = enabled;
    });
  }

  registerListeners() {
    this.registerClientEventListeners();

    const evtOptions = {signal: this._eventAbortController.signal};

    const onActionSelection = (e: Event) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (!e.target.classList.contains('action')) return;

      const dataset = e.target.dataset;
      // @ts-expect-error
      const action = JSON.parse(dataset.action) as GameAction;
      let location = dataset.location ? JSON.parse(dataset.location) as ItemLocation : null;
      const creatureId = Number(dataset.creatureId);
      const creature = this.client.context.getCreature(creatureId);
      const quantity = dataset.quantity ? Number(dataset.quantity) : undefined;
      const isClickMode = Boolean(dataset.clickMode);
      if (creature && !location) location = Utils.ItemLocation.World(creature.pos);
      if (!location) return;

      if (isClickMode) {
        this.enterClickTileMode({
          onClickTile: (selectedLocation) => {
            if (!location) return {finished: true};

            // TODO make more generic. right now this is just for item splitting.
            //   this.client.eventEmitter.emit('action', {
            //     action,
            //     location: selectedLocation,
            //     creature,
            //     quantity,
            //   });
            this.client.connection.sendCommand(CommandBuilder.moveItem({
              from: location,
              quantity: quantity || 1,
              to: selectedLocation,
            }));
            return {finished: false};
          },
          itemCursor: location.source === 'world' ?
            this.client.context.map.getItem(location.pos) :
            this.client.context.containers.get(location.id)?.items[location.index || 0],
        });
      } else {
        this.client.eventEmitter.emit('action', {
          action,
          location,
          creature,
          quantity,
        });
      }
    };
    document.body.addEventListener('click', onActionSelection, evtOptions);

    window.document.addEventListener('pointermove', (e: MouseEvent) => {
      const isOverUI = !!(e.target as HTMLElement).closest('.ui');
      const pos = worldToTile(mouseToWorld({x: e.clientX, y: e.clientY}));
      this.state.mouse = {
        ...this.state.mouse,
        x: e.clientX,
        y: e.clientY,
        tile: !isOverUI ? pos : undefined,
      };
      if (this.client.context.map.inBounds(pos)) {
        this.client.eventEmitter.emit('pointerMove', {...pos});
      }

      if (!isOverUI) {
        if (!ContextMenu.isOpen()) {
          if (this.state.mouse.tile) {
            this._mouseCursor.location = Utils.ItemLocation.World(this.state.mouse.tile);
          }
        }
      } else {
        this._mouseCursor.location = null;
      }

      if (ContextMenu.isOpen()) {
        this.itemMovingState = undefined;
      }
    }, evtOptions);

    this.canvasesEl.addEventListener('pointerdown', () => {
      this.state.mouse = {
        ...this.state.mouse,
        state: 'down',
        downTile: this.state.mouse.tile,
      };
    }, evtOptions);

    this.canvasesEl.addEventListener('pointerup', () => {
      this.state.mouse = {
        ...this.state.mouse,
        state: 'up',
      };
    }, evtOptions);

    this.canvasesEl.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
    }, evtOptions);

    // TODO: touch doesn't really work well.
    let longTouchTimer: NodeJS.Timeout | null = null;
    this.canvasesEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (longTouchTimer) return;
      longTouchTimer = setTimeout(() => {
        const touch = e.targetTouches.item(0);
        if (!touch) return;
        const mouse = {x: touch.pageX, y: touch.pageY};
        const tile = worldToTile(mouseToWorld(mouse));
        ContextMenu.openForLocation(mouse, Utils.ItemLocation.World(tile));
        longTouchTimer = null;
      }, 1000);
    }, {capture: false, signal: this._eventAbortController.signal});
    this.canvasesEl.addEventListener('touchend', () => {
      if (!longTouchTimer) return;
      clearInterval(longTouchTimer);
      longTouchTimer = null;
    }, {capture: false, signal: this._eventAbortController.signal});

    this.world.interactive = true;
    this.world.on('pointerdown', (e: PIXI.InteractionEvent) => {
      if (this.isEditingMode()) return;

      const point = worldToTile(mouseToWorld({x: e.data.global.x, y: e.data.global.y}));
      if (!this.client.context.map.inBounds(point)) return;
      const item = this.client.context.map.getItem(point);
      if (!item || !item.type) return;
      if (!this.state.mouse.tile) return;

      const evtListener = (e2: PIXI.InteractionEvent) => {
        const point2 = worldToTile(mouseToWorld({x: e2.data.global.x, y: e2.data.global.y}));
        if (!Utils.equalPoints(point, point2)) {
          this.client.eventEmitter.emit('itemMoveBegin', {
            location: Utils.ItemLocation.World(point),
            item,
          });
          this.world.off('pointermove', evtListener);
        }
      };
      this.world.on('pointermove', evtListener);
      this.world.once('pointerup', () => this.world.off('pointermove', evtListener));
    }, evtOptions);
    this.world.on('pointerup', (e: PIXI.InteractionEvent) => {
      if (Utils.equalPoints(this.state.mouse.tile, this.getPlayerPosition())) {
        this.client.eventEmitter.emit('itemMoveEnd', {
          location: Utils.ItemLocation.Container(this.client.player.containerId),
        });
      } else if (this.state.mouse.tile) {
        this.client.eventEmitter.emit('itemMoveEnd', {
          location: Utils.ItemLocation.World(this.state.mouse.tile),
        });
      }

      const pos = worldToTile(mouseToWorld({x: e.data.global.x, y: e.data.global.y}));
      this.client.eventEmitter.emit('pointerUp', {...pos});

      if (this.state.clickTileMode) {
        this.state.clickTileMode.onClick(Utils.ItemLocation.World(pos));
      }
    }, evtOptions);
    this.world.on('pointerdown', (e: PIXI.InteractionEvent) => {
      if (ContextMenu.isOpen()) {
        ContextMenu.close();
        return;
      }

      const pos = worldToTile(mouseToWorld({x: e.data.global.x, y: e.data.global.y}));
      this.modules.selectedView.selectView(Utils.ItemLocation.World(pos));

      if (this.client.context.map.inBounds(pos)) {
        this.client.eventEmitter.emit('tileClicked', {...pos}); // TODO remove
        this.client.eventEmitter.emit('pointerDown', {...pos});
      }

      // Temporary.
      if (this.client.settings.clickMagic && Content.getBaseDir() === 'worlds/rpgwo-world') {
        const graphics = Math.random() > 0.5 ? {graphic: 60, graphicFrames: 10} : {graphic: 80, graphicFrames: 5};
        const frames: GridiaAnimation['frames'] =
          Utils.emptyArray(graphics.graphicFrames).map((_, i) => ({sprite: graphics.graphic + i}));
        frames[0].sound = 'magic';

        const args = {
          tint: 0x000055,
          path: calcStraightLine(this.worldContainer.camera.focus, pos),
          light: 4,
          offshootRate: 0.2,
          frames,
        };
        this.worldContainer.animationController.addEmitter(args);
        this.client.connection.sendCommand(CommandBuilder.rawAnimation({
          ...args,
          pos,
        }));
      }
    }, evtOptions);

    this.canvasesEl.addEventListener('keydown', (e) => {
      this.keys[e.keyCode] = true;
    }, evtOptions);

    // TODO: listen to the document.body
    this.canvasesEl.addEventListener('keyup', (e) => {
      delete this.keys[e.keyCode];

      // TODO replace with something better - game loaded / ready.
      // or just don't register these events until ready?
      if (!this.getPlayerCreature()) return;
      const focusPos = this.getPlayerPosition();

      const inventoryWindow = this.containerWindows.get(this.client.player.containerId);

      // Number keys for selecting tool in inventory.
      if (inventoryWindow && e.keyCode >= KEYS.ZERO && e.keyCode <= KEYS.NINE) {
        const num = e.keyCode - KEYS.ZERO;

        // 1234567890
        if (num === 0) {
          inventoryWindow.actions.setSelectedIndex(9);
        } else {
          inventoryWindow.actions.setSelectedIndex(num - 1);
        }
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
          currentCursor = {...this.client.context.getCreature(this.state.selectedView.creatureId).pos};
        } else if (this.state.selectedView.location?.source === 'world') {
          currentCursor = this.state.selectedView.location.pos;
        } else {
          currentCursor = {...focusPos};
        }

        currentCursor.x += dx;
        currentCursor.y += dy;
        this.modules.selectedView.selectView(Utils.ItemLocation.World(currentCursor));
      }

      let location;
      if (this.state.selectedView.location?.source === 'world') {
        location = this.state.selectedView.location;
      } else {
        location = Utils.ItemLocation.World(this.client.creature.pos);
      }
      for (const [controlName, binding] of Object.entries(this.client.settings.bindings)) {
        if (binding.key !== e.keyCode) continue;
        if ((binding.shift || false) !== e.shiftKey) continue;
        if ((binding.control || false) !== e.ctrlKey) continue;
        if ((binding.alt || false) !== e.altKey) continue;
        if ((binding.meta || false) !== e.metaKey) continue;

        this.handleBinding(controlName as keyof Settings['bindings'], location);
      }

      // T to toggle z.
      const partition = this.client.context.map.partitions.get(focusPos.w);
      if (e.key === 't' && partition && partition.depth > 1) {
        const down = focusPos.z === 0;
        this.client.connection.sendCommand(CommandBuilder.chat({
          text: down ? '/down' : '/up',
        }));
      }

      if (this.state.clickTileMode &&
        [KEYS.BACKSPACE, KEYS.ESCAPE, KEYS.W, KEYS.A, KEYS.S, KEYS.D].includes(e.keyCode)) {
        this.exitClickTileMode();
      }
    }, evtOptions);

    const onClickCallback = (e: MouseEvent) => {
      const mouse = {x: e.pageX, y: e.pageY};
      const pos = worldToTile(mouseToWorld(mouse));
      const location = Utils.ItemLocation.World(pos);

      for (const [controlName, binding] of Object.entries(this.client.settings.bindings)) {
        if (binding.mouse !== e.button) continue;
        if ((binding.shift || false) !== e.shiftKey) continue;
        if ((binding.control || false) !== e.ctrlKey) continue;
        if ((binding.alt || false) !== e.altKey) continue;
        if ((binding.meta || false) !== e.metaKey) continue;

        this.handleBinding(controlName as keyof Settings['bindings'], location);
      }
    };
    this.canvasesEl.addEventListener('auxclick', onClickCallback);
    this.canvasesEl.addEventListener('click', onClickCallback);

    // resize the canvas to fill browser window dynamically
    const resize = () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', resize, evtOptions);
    resize();

    const chatInput = Helper.find('.chat-input') as HTMLInputElement;
    const chatForm = Helper.find('.chat-form');
    const chatTextarea = Helper.find('.chat-area');
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!chatInput.value) return;

      this.client.connection.sendCommand(CommandBuilder.chat({
        text: chatInput.value,
      }));
      if (chatInput.value.startsWith('/') && chatInput.value !== this._chatMemory[this._chatMemory.length - 1]) {
        this._chatMemory.push(chatInput.value);
        this.addToChat('All', chatInput.value);
      }
      chatInput.value = '';
      chatMemoryIndex = null;
      chatTextarea.scrollTop = chatTextarea.scrollHeight;
      this.focus();
    }, evtOptions);

    let chatMemoryIndex: number | null = null;
    chatInput.addEventListener('keyup', (e) => {
      let delta = 0;
      if (e.keyCode === KEYS.UP_ARROW) delta = -1;
      if (e.keyCode === KEYS.DOWN_ARROW) delta = 1;
      if (delta === 0 || this._chatMemory.length === 0 || (chatInput.value && chatMemoryIndex === null)) return;

      if (chatMemoryIndex === null) chatMemoryIndex = this._chatMemory.length;
      chatMemoryIndex = Utils.clamp(chatMemoryIndex + delta, 0, this._chatMemory.length);
      chatInput.value = chatMemoryIndex === this._chatMemory.length ? '' : this._chatMemory[chatMemoryIndex];
    });

    // TODO: rename panels cuz they aren't panels anymore.
    Helper.find('.panels__tabs').addEventListener('click', (e) => {
      const targetEl = e.target as HTMLElement;
      const name = targetEl.dataset.panel as string;
      targetEl.classList.toggle('panels__tab--active');
      const active = targetEl.classList.contains('panels__tab--active');

      if (active) {
        this.windowManager.showWindow(name);
      } else {
        this.windowManager.hideWindow(name);
      }
    }, evtOptions);

    Helper.find('.chat-sections').addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const sectionEl = target.closest('.chat-section');
      if (sectionEl) this.setChatSection(sectionEl.getAttribute('name') || 'All');
    }, evtOptions);

    // If running server locally, give it a chance to save data before closing window.
    if (this.client.connection instanceof WorkerConnection) {
      window.addEventListener('beforeunload', (e) => {
        e.preventDefault();
        e.returnValue = '';

        // @ts-expect-error
        const serverWorker: ServerWorker = window.Gridia.controller.serverWorker;
        // The browser will display an alert box, which is very likely enough
        // time to do the saving. However, the alert box message is not customizable
        // and will say "Data may not be saved".
        serverWorker.shutdown().then(() => console.log('saved!'));
      }, evtOptions);
    }
  }

  handleBinding(bindingName: keyof Settings['bindings'], location: ItemLocation) {
    switch (bindingName) {
    case 'actionMenu':
      ContextMenu.openForLocation(this.state.mouse, location);
      break;
    case 'pickup':
      if (this.modules.admin?.window.delegate.isOpen()) return;
      if (location.source !== 'world') return;

      this.client.connection.sendCommand(CommandBuilder.moveItem({
        from: Utils.ItemLocation.World(location.pos),
        to: Utils.ItemLocation.Container(this.client.player.containerId),
      }));
      break;
    case 'useHand':
      if (this.state.selectedView.location?.source === 'world') {
        Helper.useHand(this.state.selectedView.location.pos);
      }
      break;
    case 'useTool':
      if (location.source !== 'world') return;

      Helper.useTool(location.pos, {toolIndex: Helper.getSelectedToolIndex()});
      break;
    case 'moveTo':
      if (location.source !== 'world') return;

      this.modules.movement.moveTo(location.pos);
      break;
    case 'targetPrevious':
      this.cycleSelectedTarget(-1);
      break;
    case 'targetNext':
      this.cycleSelectedTarget(1);
      break;
    case 'toggleInventory':
      if (!this.client.inventory?.id) return;

      this.containerWindows.get(this.client.inventory.id)?.delegate.toggle();
      break;
    case 'toggleMap':
      this.windowManager.getWindow('map').toggle();
      break;
    case 'toggleSkills':
      this.windowManager.getWindow('skills').toggle();
      break;
    case 'attack':
      if (this.client.session.attackingCreatureId) {
        // Disable attack.
        this.client.connection.sendCommand(CommandBuilder.creatureAction({
          type: 'attack',
          creatureId: 0,
        }));
        this.client.session.attackingCreatureId = null;
      } else if (this.state.selectedView.creatureId) {
        this.client.connection.sendCommand(CommandBuilder.creatureAction({
          type: 'attack',
          creatureId: this.state.selectedView.creatureId,
        }));
      }
      break;
    default:
      throw new Error('unknown control: ' + bindingName);
    }
  }

  cycleSelectedTarget(delta: number) {
    const focusPos = this.getPlayerPosition();

    const creaturesSortedByDistance = [];
    for (const creature of this.client.context.creatures.values()) {
      if (creature.id === this.client.session.creatureId) continue;
      if (creature.pos.w !== focusPos.w) continue;
      if (creature.pos.z !== focusPos.z) continue;
      if (!this.worldContainer.camera.contains(creature.pos)) continue;

      creaturesSortedByDistance.push(creature);
    }
    creaturesSortedByDistance.sort((a, b) => {
      const distA = Utils.dist(focusPos, a.pos);
      const distB = Utils.dist(focusPos, b.pos);
      return distA - distB;
    });
    if (creaturesSortedByDistance.length === 0) return;

    const currentTargetedCreatureId = this.state.selectedView.creatureId;
    let currentTargetedCreatureIndex = currentTargetedCreatureId === undefined ?
      undefined :
      creaturesSortedByDistance.findIndex((c) => c.id === currentTargetedCreatureId);
    if (currentTargetedCreatureIndex === -1) currentTargetedCreatureIndex = 0;

    let nextTargetedCreatureIndex = currentTargetedCreatureIndex === undefined ?
      0 :
      currentTargetedCreatureIndex + delta;
    if (nextTargetedCreatureIndex === -1) nextTargetedCreatureIndex = creaturesSortedByDistance.length - 1;
    if (nextTargetedCreatureIndex === creaturesSortedByDistance.length) nextTargetedCreatureIndex = 0;

    const nextTargetedCreature = creaturesSortedByDistance[nextTargetedCreatureIndex];
    this.modules.selectedView.selectView(Utils.ItemLocation.World(nextTargetedCreature.pos));
  }

  getOpenContainerId() {
    const ids = [...this.containerWindows.keys()];
    const openContainerId =
      ids.find((id) => id !== this.client.player.equipmentContainerId && id !== this.client.player.containerId);
    return openContainerId;
  }

  tick() {
    const now = performance.now();
    this.state.elapsedFrames = (this.state.elapsedFrames + 1) % 60000;
    const worldTime = this.client.worldTime;

    Draw.sweepTexts();
    // super lame.
    this.client.context.syncCreaturesOnTiles();

    const focusPos = this.getPlayerPosition();
    const {w, z} = focusPos;
    const {partition} = this.client.getOrRequestPartition(w);
    if (!partition) return;

    if (!this.getPlayerCreature()) return;
    if (partition.width === 0) return;

    // Make container windows.
    // TODO: move this somewhere else. shouldn't be in update loop...
    for (const [id, container] of this.client.context.containers.entries()) {
      let containerWindow = this.containerWindows.get(id);
      if (containerWindow) continue;

      let name;
      if (id === this.client.player.containerId) name = 'Inventory';
      if (id === this.client.player.equipmentContainerId) name = 'Equipment';

      if (container.type === 'merchant') {
        if (this.storeWindow) continue;

        this.storeWindow = makeStoreWindow(this, container, 'Store');
        const close2 = () => {
          if (this.storeWindow) this.storeWindow.delegate.remove();

          game.client.eventEmitter.removeListener('playerMove', close2);
          this.storeWindow = undefined;
          game.client.context.containers.delete(container.id);
        };
        game.client.eventEmitter.on('playerMove', close2);
        continue;
      }

      containerWindow = makeContainerWindow(this, container, name);
      this.containerWindows.set(id, containerWindow);

      if (container.type === 'equipment') {
        containerWindow.actions.setEquipmentWindow({
          equipmentGraphics: this.client.creature.equipmentGraphics,
          stats: this.client.creature.stats,
        });
      }

      if (![game.client.player.containerId, game.client.player.equipmentContainerId].includes(container.id)) {
        game.client.eventEmitter.on('playerMove', close);
      }
      function close() {
        if (containerWindow) containerWindow.delegate.remove();
        game.client.eventEmitter.removeListener('playerMove', close);
        game.containerWindows.delete(container.id);
        game.client.context.containers.delete(container.id);
      }

    }

    const scale = this.client.settings.scale || 1;
    this.app.stage.scale.set(scale);
    let tilesWidth = Math.ceil(this.app.view.width / GFX_SIZE / scale);
    let tilesHeight = Math.ceil(this.app.view.height / GFX_SIZE / scale);

    if (this.client.settings.limitView) {
      tilesWidth = Math.min(23, tilesWidth);
      tilesHeight = Math.min(17, tilesWidth);
    }

    // Hand-picked values.
    const lightData = [
      0, 0, 0, 0, // 12AM
      0, 1, 2, 3, // 4AM
      4, 5, 6, 6, // 8AM
      7, 7, 7, 7, // 12PM
      6, 5, 5, 4, // 4PM
      4, 3, 2, 1, // 8PM
    ];
    const getLight = (hour: number) => lightData[hour % lightData.length];

    const lightThisHour = getLight(worldTime.hour);
    const lightNextHour = getLight(worldTime.hour + 1);
    this.worldContainer.ambientLight = lightThisHour + (lightNextHour - lightThisHour) * worldTime.minute / 60;

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

    // Transient display objects must be destroyed to prevent memory leaks.
    for (const layer of layersManagedByGameLoop) {
      for (const child of layer.children) {
        child.destroy();
      }
    }

    const creatureSpritesNotSeen = new Set([...this.creatureSprites.keys()]);

    const start = {x: startTileX, y: startTileY, z};
    for (const {pos, tile} of partition.getIteratorForArea(start, tilesWidth, tilesHeight)) {
      const {x, y} = pos;
      const creature = this.client.context.getCreatureAt({w, ...pos});

      // TODO: don't make creature sprites on every tick.
      if (creature) {
        creatureSpritesNotSeen.delete(creature.id);

        let creatureSprite = this.creatureSprites.get(creature.id);
        if (!creatureSprite) {
          creatureSprite = new CreatureSprite(creature);
          this.creatureSprites.set(creature.id, creatureSprite);
          this.worldContainer.layers.creatures.addChild(creatureSprite);
        }

        creatureSprite.x = x * GFX_SIZE;
        creatureSprite.y = (y - creatureSprite.tileScale * creatureSprite.tileHeight + 1) * GFX_SIZE;
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
      creatureSprite.destroy();
    }

    // Draw item under cursor.
    {
      const {x, y} = this.state.mouse;
      this.itemCursorGraphic.el.style.left = `${x - GFX_SIZE / 2}px`;
      this.itemCursorGraphic.el.style.top = `${y - GFX_SIZE / 2}px`;
    }

    // Set _selectedViewCursor.
    const selectedCreatureId = this.state.selectedView.creatureId;
    const selectedViewLoc = selectedCreatureId ?
      this.client.context.getCreature(selectedCreatureId).pos :
      (this.state.selectedView.location?.source === 'world' && this.state.selectedView.location.pos);
    if (selectedViewLoc) {
      this._selectedViewCursor.location = Utils.ItemLocation.World(selectedViewLoc);
      if (selectedCreatureId && selectedCreatureId === this.client.session.attackingCreatureId) {
        this._selectedViewCursor.color = 'red';
        this._selectedViewCursor.smooth = false;
      } else if (selectedCreatureId) {
        this._selectedViewCursor.color = 'green';
        this._selectedViewCursor.smooth = false;
      } else {
        this._selectedViewCursor.color = 'white';
        this._selectedViewCursor.smooth = true;
      }
    } else {
      this._selectedViewCursor.location = null;
    }

    // Hide mouse cursor if any other cursors are in same location.
    for (const cursor of this._cursors) {
      if (cursor === this._mouseCursor) continue;
      if (!cursor.location || !this._mouseCursor.location) continue;
      if (!Utils.ItemLocation.Equal(cursor.location, this._mouseCursor.location)) continue;

      this._mouseCursor.location = null;
    }

    // Draw cursors.
    for (const cursor of this._cursors) {
      cursor.el.hidden = !cursor.location;
      if (!cursor.location) continue;
      if (cursor.location.source !== 'world') continue;

      const size = GFX_SIZE * this.client.settings.scale;
      const x = (cursor.location.pos.x - this.worldContainer.camera.left) * size;
      const y = (cursor.location.pos.y - this.worldContainer.camera.top) * size;
      cursor.el.style.setProperty('--size', size + 'px');
      cursor.el.style.setProperty('--color', cursor.color);
      cursor.el.style.setProperty('--x', x + 'px');
      cursor.el.style.setProperty('--y', y + 'px');
      cursor.el.classList.toggle('grid-cursor--smooth', cursor.smooth);

      // TODO: don't redraw these every frame.
      // Draw selected tool if usable.
      if (cursor === this._selectedViewCursor && !this.state.selectedView.creatureId) {
        const sprite = new PIXI.Sprite();
        sprite.x = cursor.location.pos.x * GFX_SIZE;
        sprite.y = cursor.location.pos.y * GFX_SIZE;
        this.worldContainer.layers.top.addChild(sprite);

        const tool = Helper.getSelectedTool();
        const selectedItem = this.client.context.map.getItem(cursor.location.pos);
        if (tool && selectedItem && Helper.usageExists(tool.type, selectedItem.type)) {
          const itemSprite = Draw.makeItemSprite({type: tool.type, quantity: 1});
          itemSprite.anchor.x = itemSprite.anchor.y = 0.5;
          sprite.addChild(itemSprite);
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
      this._currentHoverItemText.y = this.app.view.height - this._currentHoverItemText.height;
    } else {
      this._currentHoverItemText.visible = false;
    }

    for (const el of Helper.findAll('.relative-time')) {
      const time = Number(el.getAttribute('data-time'));
      const format = el.getAttribute('data-format');
      if (format) {
        const delta = Date.now() - time;
        el.textContent = Duration.fromMillis(delta).toFormat(format);
      } else {
        const delta = time - Date.now();
        let unit;
        if (delta > 1000 * 60 * 60 * 2) {
          unit = 'hours' as const;
        } else if (delta > 1000 * 60 * 2) {
          unit = 'minutes' as const;
        } else {
          unit = 'seconds' as const;
        }
        const expiresAt = DateTime.fromMillis(time);
        el.textContent = expiresAt.toRelative({unit});
      }
    }

    for (const clientModule of Object.values(this.modules)) {
      clientModule?.onTick(now);
    }
  }

  // TODO: combine with creatureSprite.addSTatusText ...
  addStatusText(text: string) {
    Helper.find('.status-texts').style.bottom = Helper.find('.panels__tabs').offsetHeight + 'px';

    const statusTextEl = document.createElement('div');
    statusTextEl.classList.add('status-text');
    setTimeout(() => statusTextEl.classList.add('status-text--remove'), 500);
    statusTextEl.textContent = text;
    // TODO: add one listener to .status-texts
    statusTextEl.addEventListener('transitionend', () => statusTextEl.remove(), {once: true});
    Helper.find('.status-texts').appendChild(statusTextEl);
  }

  isOnStage(displayObject: PIXI.DisplayObject) {
    let parent = displayObject.parent;
    while (parent && parent.parent) {
      parent = parent.parent;
    }
    return parent === this.app.stage;
  }

  createDataForActionEl(opts: { action: GameAction; location?: ItemLocation; creatureId?: number }) {
    return {
      'data-action': JSON.stringify(opts.action),
      'data-location': JSON.stringify(opts.location),
      'data-creature-id': opts.creatureId ? String(opts.creatureId) : '',
    };
  }

  addDataToActionEl(actionEl: HTMLElement, opts: { action: GameAction; location?: ItemLocation; creatureId?: number }) {
    actionEl.classList.add('action');
    actionEl.title = opts.action.title;
    actionEl.innerText = opts.action.innerText;
    for (const [key, value] of Object.entries(this.createDataForActionEl(opts))) {
      if (value !== undefined) actionEl.setAttribute(key, value);
    }
  }

  addToChat(section: string, text: string, from?: string) {
    this._chatLog.push({section, text, from});
    if (section === this._currentChatSection || this._currentChatSection === 'All') {
      const chatTextarea = Helper.find('.chat-area') as HTMLTextAreaElement;
      const isMaxScroll = (chatTextarea.scrollTop + chatTextarea.offsetHeight) >= chatTextarea.scrollHeight;
      chatTextarea.value += `${this.formatChatEntry(text, from)}\n`;
      if (isMaxScroll) chatTextarea.scrollTop = chatTextarea.scrollHeight;
    }
  }

  enterClickTileMode(opts: {
    onClickTile: (location: WorldLocation) => { finished: boolean };
    itemCursor?: Item | null;
  }) {
    Helper.find('.game').classList.add('select-tile-mode');
    this.focus();

    if (opts.itemCursor) {
      const meta = Content.getMetaItem(opts.itemCursor.type);
      this.itemCursorGraphic.setState({
        graphic: {
          file: meta.graphics.file,
          index: meta.graphics.frames[0],
        },
      });
    }

    this.state.clickTileMode = {
      onClick: (location: WorldLocation) => {
        const result = opts.onClickTile(location);
        if (result.finished === true) this.exitClickTileMode();
      },
      itemCursor: opts.itemCursor,
    };
  }

  exitClickTileMode() {
    if (!this.state.clickTileMode) return;

    Helper.find('.game').classList.remove('select-tile-mode');
    if (this.state.clickTileMode.itemCursor) this.itemCursorGraphic.setState({graphic: undefined});
    this.state.clickTileMode = undefined;
  }

  private setChatSection(name: string) {
    this._currentChatSection = name;

    const currentSectionEl = Helper.maybeFind('.chat-section.selected');
    if (currentSectionEl) currentSectionEl.classList.remove('selected');
    const el = Helper.find(`.chat-section[name="${name}"]`);
    el.classList.add('selected');

    const chatTextarea = Helper.find('.chat-area') as HTMLTextAreaElement;
    chatTextarea.value = '';
    for (const entry of this._chatLog) {
      if (entry.section === name || name === 'All') {
        chatTextarea.value += `${this.formatChatEntry(entry.text, entry.from)}\n`;
      }
    }

    chatTextarea.scrollTop = chatTextarea.scrollHeight;
  }

  private createChatSection(name: string) {
    const sectionsEl = Helper.find('.chat .chat-sections');
    const el = Helper.createChildOf(sectionsEl, 'button', 'chat-section m0', {name});
    el.textContent = name;
  }

  private formatChatEntry(text: string, from?: string) {
    if (!from) return text;
    return `${from}: ${text}`;
  }
}
