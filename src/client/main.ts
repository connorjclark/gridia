import * as Content from '../content';
import { makeGame } from '../game-singleton';
import * as ProtocolBuilder from '../protocol/client-to-server-protocol-builder';
import * as Utils from '../utils';
import Client from './client';
import { connect, connectToServerWorker } from './connect-to-server';
import { GameActionEvent } from './event-emitter';
import * as Helper from './helper';
import AdminClientModule from './modules/admin-module';
import MovementClientModule from './modules/movement-module';
import SettingsClientModule from './modules/settings-module';
import SkillsClientModule from './modules/skills-module';
import { createMapSelectForm, DEFAULT_MAP_FORM_STATE, stateToMapGenOptions } from './scenes/map-select-scene';
import { ServerWorker } from './server-worker';

function parseQuery(queryString: string) {
  const query: Record<string, any> = {};
  const pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=', 2);
    query[decodeURIComponent(key)] = decodeURIComponent(value || '');
  }
  return query;
}

const qs = parseQuery(window.location.search);

class MainController {
  private scenes: Scene[] = [];
  private client_: Client | null = null;
  private serverWorker_: ServerWorker | null = null;

  public pushScene(newScene: Scene) {
    if (this.currentScene) this.currentScene.onHide();
    this.scenes.push(newScene);
    newScene.onShow();
  }

  public popScene() {
    if (this.currentScene) {
      this.currentScene.onHide();
      this.currentScene.onDestroy();
      this.scenes.pop();
    }
    this.currentScene.onShow();
  }

  public async loadWorker() {
    if (this.serverWorker_) return;
    this.serverWorker_ = new ServerWorker();
    await this.serverWorker_.init();
  }

  get currentScene() {
    return this.scenes[this.scenes.length - 1];
  }

  get client() {
    if (!this.client_) throw new Error('missing client');
    return this.client_;
  }

  set client(client: Client) {
    this.client_ = client;
  }

  public destoryClient() {
    this.client_?.connection.close();
    this.client_ = null;
  }

  get serverWorker() {
    if (!this.serverWorker_) throw new Error('missing server worker');
    return this.serverWorker_;
  }

  set serverWorker(worker: ServerWorker) {
    this.serverWorker_ = worker;
  }
}

class Scene {
  constructor(public element: HTMLElement) {
  }

  public onShow() {
    this.element.classList.remove('hidden');
  }

  public onHide() {
    this.element.classList.add('hidden');
  }

  public onDestroy() {
    // Empty.
  }
}

class StartScene extends Scene {
  private localBtn: HTMLElement;
  private connectBtn: HTMLElement;
  private serverLocationInput: HTMLInputElement;

  constructor() {
    super(Helper.find('.start'));
    this.localBtn = Helper.find('.start--local-btn', this.element);
    this.connectBtn = Helper.find('.start--connect-btn', this.element);
    this.serverLocationInput = Helper.find('#start--server-location', this.element) as HTMLInputElement;
    this.onClickLocalBtn = this.onClickLocalBtn.bind(this);
    this.onClickConnectBtn = this.onClickConnectBtn.bind(this);

    this.serverLocationInput.value = `${window.location.hostname}:9001`;
  }

  public async onClickLocalBtn() {
    await controller.loadWorker();
    controller.pushScene(new MapSelectScene());
  }

  public async onClickConnectBtn() {
    controller.client = await createClientForServer(this.serverLocationInput.value);
    controller.pushScene(new RegisterScene());
  }

  public onShow() {
    super.onShow();
    this.localBtn.addEventListener('click', this.onClickLocalBtn);
    this.connectBtn.addEventListener('click', this.onClickConnectBtn);
  }

  public onHide() {
    super.onHide();
    this.localBtn.removeEventListener('click', this.onClickLocalBtn);
    this.connectBtn.removeEventListener('click', this.onClickConnectBtn);
  }
}

class MapSelectScene extends Scene {
  private mapListEl: HTMLElement;
  private selectBtn: HTMLElement;
  private previewEl: HTMLElement;
  private inputFormEl: HTMLElement;
  private loadingPreview = false;
  private mapFormState = JSON.parse(JSON.stringify(DEFAULT_MAP_FORM_STATE));

  constructor() {
    super(Helper.find('.map-select'));
    this.mapListEl = Helper.find('.map-list');
    this.selectBtn = Helper.find('.generate--select-btn', this.element);
    this.previewEl = Helper.find('.generate--preview', this.element);
    this.inputFormEl = Helper.find('.generate--input-form', this.element);
    this.generateMap = this.generateMap.bind(this);
    this.onClickSelectBtn = this.onClickSelectBtn.bind(this);
    this.onSelectMap = this.onSelectMap.bind(this);
  }

  public async renderMapSelection() {
    this.mapListEl.innerHTML = '';

    const mapNames = await getMapNames();
    for (const name of mapNames) {
      const mapEl = document.createElement('li');
      mapEl.classList.add('map-list--item');
      mapEl.setAttribute('data-name', name);
      mapEl.innerText = name;
      this.mapListEl.append(mapEl);
    }
  }

  public async generateMap() {
    if (this.loadingPreview) return;
    this.loadingPreview = true;

    const canvas = document.createElement('canvas') as HTMLCanvasElement;
    const offscreen = canvas.transferControlToOffscreen();
    const opts = stateToMapGenOptions(this.mapFormState);
    const seeds = await generateMap(opts, offscreen).finally(() => this.loadingPreview = false);
    this.mapFormState.seeds = seeds;

    this.previewEl.innerHTML = '';
    this.previewEl.append(canvas);
    this.selectBtn.classList.remove('hidden');
  }

  public async onClickSelectBtn() {
    const name = `/default-world-${this.mapListEl.childElementCount}`;
    await controller.serverWorker.saveGeneratedMap({name});
    controller.client = await connectToServerWorker(controller.serverWorker, {
      serverData: name,
      dummyDelay: 20,
      verbose: false,
    });
    controller.pushScene(new RegisterScene());
  }

  public async onSelectMap(e: Event) {
    // TODO: this is annoying.
    if (!(e.target instanceof HTMLElement)) return;

    const name = e.target.getAttribute('data-name') || '';
    loadMap(name);
  }

  public onShow() {
    super.onShow();
    this.selectBtn.addEventListener('click', this.onClickSelectBtn);
    this.mapListEl.addEventListener('click', this.onSelectMap);
    this.loadingPreview = false;
    this.previewEl.innerHTML = '';
    this.selectBtn.classList.add('hidden');
    this.renderMapSelection();
    createMapSelectForm(this.inputFormEl, this.mapFormState, (state) => {
      this.mapFormState = state;
      this.generateMap();
    });
    this.generateMap();
  }

  public onHide() {
    super.onHide();
    this.selectBtn.removeEventListener('click', this.onClickSelectBtn);
    this.mapListEl.removeEventListener('click', this.onSelectMap);
  }
}

class RegisterScene extends Scene {
  private registerBtn: HTMLElement;
  private nameInput: HTMLInputElement;

  constructor() {
    super(Helper.find('.register'));
    this.registerBtn = Helper.find('.register-btn', this.element);
    this.nameInput = Helper.find('#register--name', this.element) as HTMLInputElement;
    this.onClickRegisterBtn = this.onClickRegisterBtn.bind(this);

    const parts1 = 'Small Smelly Quick Steely Quiet'.split(' ');
    const parts2 = 'Jill Stranger Arthur Maz Harlet Worker'.split(' ');
    this.nameInput.value =
      parts1[Utils.randInt(0, parts1.length - 1)] + ' ' + parts2[Utils.randInt(0, parts2.length - 1)];
  }

  public async onClickRegisterBtn() {
    controller.client.connection.send(ProtocolBuilder.register({
      name: this.nameInput.value,
    }));

    // Wait for initialize message. This happens after a successful login.
    await new Promise((resolve, reject) => {
      controller.client.eventEmitter.once('message', (e) => {
        if (e.type === 'initialize') resolve();
        else reject(`first message should be initialize, but got ${JSON.stringify(e)}`);
      });
    });

    startGame(controller.client);
  }

  public onShow() {
    super.onShow();
    this.registerBtn.addEventListener('click', this.onClickRegisterBtn);
  }

  public onHide() {
    super.onHide();
    this.registerBtn.removeEventListener('click', this.onClickRegisterBtn);
  }

  public onDestroy() {
    controller.destoryClient();
  }
}

class GameScene extends Scene {
  constructor() {
    super(Helper.find('.game'));
  }

  public onShow() {
    super.onShow();

    // Once in game, too complicated to go back. For now, must refresh the page.
    Helper.find('.scene-controller').classList.add('hidden');
  }
}

function globalActionCreator(tile: Tile, loc: TilePoint): GameAction[] {
  const item = tile.item;
  const meta = Content.getMetaItem(item ? item.type : 0);
  const actions: GameAction[] = [];

  if (item && meta.moveable) {
    actions.push({
      type: 'pickup',
      innerText: 'Pickup',
      title: 'Shortcut: Shift',
    });
  }

  if (item && Helper.canUseHand(item.type)) {
    actions.push({
      type: 'use-hand',
      innerText: 'Use Hand',
      title: 'Shortcut: Alt',
    });
  }

  if (meta.class === 'Container') {
    actions.push({
      type: 'open-container',
      innerText: 'Open',
      title: 'Look inside',
    });
  }

  if (meta.class === 'Ball') {
    actions.push({
      type: 'throw',
      innerText: 'Throw ball',
      title: 'Throw ball',
    });
  }

  const tool = Helper.getSelectedTool();
  if (tool && Helper.usageExists(tool.type, meta.id)) {
    actions.push({
      type: 'use-tool',
      innerText: `Use ${Content.getMetaItem(tool.type).name}`,
      title: 'Shortcut: Spacebar',
    });
  }

  if (tile.creature && !tile.creature.isPlayer) {
    actions.push({
      type: 'attack',
      innerText: 'Attack',
      title: 'Attack',
    });
  }

  if (tile.creature && !tile.creature.tamedBy && !tile.creature.isPlayer) {
    actions.push({
      type: 'tame',
      innerText: 'Tame',
      title: 'Tame',
    });
  }

  return actions;
}

function globalOnActionHandler(client: Client, e: GameActionEvent) {
  const type = e.action.type;
  const { creature, loc } = e;

  switch (type) {
    case 'pickup':
      client.connection.send(ProtocolBuilder.moveItem({
        from: Utils.ItemLocation.World(loc),
        to: Utils.ItemLocation.Container(client.containerId),
      }));
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
    case 'attack':
    case 'tame':
      client.connection.send(ProtocolBuilder.creatureAction({
        creatureId: creature.id,
        type,
      }));
      break;
    case 'throw':
      // TODO
      break;
  }
}

function createClientForServer(hostnameAndPort: string) {
  const [hostname, port] = hostnameAndPort.split(':', 2);
  return connect(hostname, Number(port));
}

function setupDebugging() {
  // @ts-ignore
  window.Gridia = {
    controller,
    item(itemType: number) {
      console.log(Content.getMetaItem(itemType));
      console.log('tool', Content.getItemUsesForTool(itemType));
      console.log('focus', Content.getItemUsesForFocus(itemType));
      console.log('product', Content.getItemUsesForProduct(itemType));
    },
    clearMapCaches() {
      for (const partition of controller.client?.context.map.getPartitions().values()) {
        // @ts-ignore
        partition._clear();
      }
    },
  };

  // TODO: better 'verbose' / logging (make a logger class).
  console.log([
    'For debugging:',
    'window.Gridia.debug = true',
    'window.Gridia.debug = /move/',
    'window.Gridia.debugn = /setCreature/',
  ].join('\n'));
  // TODO: this doesn't work anymore.
  // console.log('For debugging:\nwindow.Gridia.server.verbose = true;');
}

async function getMapNames() {
  const {mapNames} = await controller.serverWorker.listMaps();
  return mapNames;
}

async function loadMap(name: string) {
  controller.client = await connectToServerWorker(controller.serverWorker, {
    serverData: `/${name}`,
    dummyDelay: 20,
    verbose: false,
  });
  controller.pushScene(new RegisterScene());
}

async function generateMap(opts: any, offscreenCanvas?: OffscreenCanvas) {
  return await controller.serverWorker.generateMap({
    ...opts,
    canvas: offscreenCanvas,
  });
}

async function startGame(client: Client) {
  const gameSingleton = makeGame(client);

  // TODO: AdminClientModule should create the panel. Until then, manually remove panel.
  if (!client.isAdmin) {
    Helper.find('.panels__tab[data-panel="admin"]').remove();
  }

  const moduleClasses = [
    MovementClientModule,
    SettingsClientModule,
    SkillsClientModule,
  ];
  if (client.isAdmin) moduleClasses.push(AdminClientModule);
  for (const moduleClass of moduleClasses) {
    gameSingleton.addModule(new moduleClass(gameSingleton));
  }
  gameSingleton.addActionCreator(globalActionCreator);
  client.eventEmitter.on('action', globalOnActionHandler.bind(globalOnActionHandler, client));

  gameSingleton.start();
  // @ts-ignore
  window.Gridia.game = gameSingleton;

  controller.pushScene(new GameScene());
}

const controller = new MainController();
document.addEventListener('DOMContentLoaded', async () => {
  setupDebugging();
  await Content.loadContentFromNetwork();

  if (qs.quick === 'server') {
    controller.pushScene(new StartScene());
    await (controller.currentScene as StartScene).onClickConnectBtn();
    await (controller.currentScene as RegisterScene).onClickRegisterBtn();
  } else if (qs.quick === 'local') {
    await controller.loadWorker();

    const mapNames = await getMapNames();
    if (!qs.map && !mapNames.includes('quick-default')) {
      await generateMap({
        bare: true,
        width: 100,
        height: 100,
        depth: 1,
      });
      await controller.serverWorker.saveGeneratedMap({name: '/quick-default'});
    }
    // TODO: improve server dir / map name mismatch.
    await loadMap(qs.map || 'quick-default');
    controller.pushScene(new RegisterScene());
  } else {
    controller.pushScene(new StartScene());
  }

  const backBtn = Helper.find('.scene-controller--back-btn');
  backBtn.addEventListener('click', () => {
    controller.popScene();
  });
});
