import { Source } from '../constants';
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
import { createMapSelectForm, getMapGenOpts } from './scenes/map-select-scene';

const QUICK = window.location.search.includes('quick');

class MainController {
  private scenes: Scene[] = [];
  private client_: Client | null = null;
  private worker_: Worker | null = null;

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
    if (this.worker_) return;
    this.worker_ = new Worker('../server/run-worker.ts');

    this.worker.postMessage({
      type: 'worker_init',
    });

    await new Promise((resolve, reject) => {
      this.worker.onmessage = (e) => {
        if (e.data !== 'ack') reject('unexpected data on init');
        delete this.worker.onmessage;
        resolve();
      };
    });
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

  get worker() {
    if (!this.worker_) throw new Error('missing worker');
    return this.worker_;
  }

  set worker(worker: Worker) {
    this.worker_ = worker;
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
  private refreshBtn: HTMLElement;
  private selectBtn: HTMLElement;
  private previewEl: HTMLElement;
  private inputFormEl: HTMLElement;
  private loadingPreview = false;

  constructor() {
    super(Helper.find('.map-select'));
    this.mapListEl = Helper.find('.map-list');
    this.refreshBtn = Helper.find('.generate--refresh-btn', this.element);
    this.selectBtn = Helper.find('.generate--select-btn', this.element);
    this.previewEl = Helper.find('.generate--preview', this.element);
    this.inputFormEl = Helper.find('.generate--input-form', this.element);
    this.onClickRefreshBtn = this.onClickRefreshBtn.bind(this);
    this.onClickSelectBtn = this.onClickSelectBtn.bind(this);
    this.onSelectMap = this.onSelectMap.bind(this);

    createMapSelectForm(this.inputFormEl);
  }

  public async renderMapSelection() {
    this.mapListEl.innerHTML = '';

    // @ts-ignore
    controller.worker.postMessage({
      type: 'worker_listmaps',
    });
    const mapNames = await getMapNames();

    for (const name of mapNames) {
      const mapEl = document.createElement('li');
      mapEl.classList.add('map-list--item');
      mapEl.setAttribute('data-name', name);
      mapEl.innerText = name;
      this.mapListEl.append(mapEl);
    }
  }

  public async onClickRefreshBtn() {
    if (this.loadingPreview) return;
    this.loadingPreview = true;

    const canvas = document.createElement('canvas') as HTMLCanvasElement;
    const offscreen = canvas.transferControlToOffscreen();
    const opts = getMapGenOpts(this.inputFormEl);
    await generateMap(opts, offscreen).finally(() => this.loadingPreview = false);

    this.previewEl.innerHTML = '';
    this.previewEl.append(canvas);
    this.selectBtn.classList.remove('hidden');
  }

  public async onClickSelectBtn() {
    const name = `/default-world-${this.mapListEl.childElementCount}`;
    await saveGeneratedMap(name);
    controller.client = await connectToServerWorker(controller.worker, {
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
    this.refreshBtn.addEventListener('click', this.onClickRefreshBtn);
    this.selectBtn.addEventListener('click', this.onClickSelectBtn);
    this.mapListEl.addEventListener('click', this.onSelectMap);
    this.loadingPreview = false;
    this.previewEl.innerHTML = '';
    this.selectBtn.classList.add('hidden');
    this.renderMapSelection();
  }

  public onHide() {
    super.onHide();
    this.refreshBtn.removeEventListener('click', this.onClickRefreshBtn);
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
    this.nameInput.value = parts1[Utils.randInt(0, parts1.length)] + ' ' + parts2[Utils.randInt(0, parts2.length)];
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
  const actions = [] as Array<{ innerText: string, title: string, type: string }>;

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

  if (tile.creature && !tile.creature.tamedBy && !tile.creature.isPlayer) {
    actions.push({
      type: 'tame',
      innerText: 'Tame',
      title: '',
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
        fromSource: Source.World,
        from: loc,
        toSource: client.containerId,
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
    case 'tame':
      client.connection.send(ProtocolBuilder.tame({
        creatureId: creature.id,
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
    PIXI: require('pixi.js'),
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
  // @ts-ignore
  controller.worker.postMessage({
    type: 'worker_listmaps',
  });
  const mapNames: string[] = await new Promise((resolve) => {
    controller.worker.onmessage = (e) => {
      delete controller.worker.onmessage;
      resolve(e.data.mapNames);
    };
  });
  return mapNames;
}

async function loadMap(name: string) {
  controller.client = await connectToServerWorker(controller.worker, {
    serverData: `/${name}`,
    dummyDelay: 20,
    verbose: false,
  });
  controller.pushScene(new RegisterScene());
}

async function generateMap(opts: any, offscreenCanvas?: OffscreenCanvas) {
  // @ts-ignore
  const transfer: PostMessageOptions = [];
  // @ts-ignore
  if (offscreenCanvas) transfer.push(offscreenCanvas);

  controller.worker.postMessage({
    type: 'worker_mapgen',
    canvas: offscreenCanvas,
    ...opts,
  }, transfer);

  await new Promise((resolve) => {
    controller.worker.onmessage = (e) => {
      delete controller.worker.onmessage;
      resolve();
    };
  });
}

async function saveGeneratedMap(name: string) {
  // @ts-ignore
  controller.worker.postMessage({
    type: 'worker_savemapgen',
    name,
  });

  await new Promise((resolve) => {
    controller.worker.onmessage = (e) => {
      delete controller.worker.onmessage;
      resolve();
    };
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

  if (QUICK) {
    await controller.loadWorker();
    const mapNames = await getMapNames();
    if (!mapNames.includes('quick-default')) {
      await generateMap({
        bare: true,
        width: 100,
        height: 100,
        depth: 1,
      });
      await saveGeneratedMap('/quick-default');
    }
    await loadMap('/quick-default');
    controller.pushScene(new RegisterScene());
  } else {
    controller.pushScene(new StartScene());
  }

  const backBtn = Helper.find('.scene-controller--back-btn');
  backBtn.addEventListener('click', () => {
    controller.popScene();
  });
});
