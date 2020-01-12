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

class MainController {
  private scene: Scene | null = null;
  private client_: Client | null = null;
  private worker_: Worker | null = null;

  public showScene(newScreen: Scene) {
    if (this.scene) this.scene.onHide();
    this.scene = newScreen;
    this.scene.onShow();
  }

  public async loadWorker() {
    if (this.worker_) return;
    this.worker_ = new Worker('../server/run-worker.ts');

    this.worker.postMessage({
      type: 'worker_init',
    });

    await new Promise((resolve, reject) => {
      this.worker.onmessage = (e) =>  {
        if (e.data !== 'ack') reject('unexpected data on init');
        delete this.worker.onmessage;
        resolve();
      };
    });
  }

  get client() {
    if (!this.client_) throw new Error('missing client');
    return this.client_;
  }

  set client(client: Client) {
    this.client_ = client;
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
    controller.showScene(new MapSelectScene());
  }

  public async onClickConnectBtn() {
    controller.client = await createClientForServer(this.serverLocationInput.value);
    controller.showScene(new RegisterScene());
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
  private refreshBtn: HTMLElement;
  private selectBtn: HTMLElement;
  private previewEl: HTMLElement;
  private loadingPreview = false;

  constructor() {
    super(Helper.find('.map-select'));
    this.refreshBtn = Helper.find('.generate--refresh-btn', this.element);
    this.selectBtn = Helper.find('.generate--select-btn', this.element);
    this.previewEl = Helper.find('.generate--preview', this.element);
    this.onClickRefreshBtn = this.onClickRefreshBtn.bind(this);
    this.onClickSelectBtn = this.onClickSelectBtn.bind(this);
  }

  public async onClickRefreshBtn() {
    if (this.loadingPreview) return;
    this.loadingPreview = true;

    const canvas = document.createElement('canvas') as HTMLCanvasElement;
    const offscreen = canvas.transferControlToOffscreen();

    // @ts-ignore
    controller.worker.postMessage({
      type: 'worker_mapgen',
      canvas: offscreen,
      width: 200,
      height: 200,
      depth: 1,
      bare: false,
    }, [offscreen]);

    await new Promise((resolve) => {
      controller.worker.onmessage = (e) =>  {
        delete controller.worker.onmessage;
        resolve();
      };
    }).finally(() => this.loadingPreview = false);

    this.previewEl.innerHTML = '';
    this.previewEl.append(canvas);
  }

  public async onClickSelectBtn() {
    controller.client = await connectToServerWorker(controller.worker, {
      useMapPreview: true,
      serverData: '/',
      dummyDelay: 20,
      verbose: false,
    });
    controller.showScene(new RegisterScene());
  }

  // public async onMapSelected() {
  //   controller.client = await connectToServerWorker(controller.worker, {
  //     serverData: '/',
  //     dummyDelay: 20,
  //     verbose: false,
  //   });
  // }

  public onShow() {
    super.onShow();
    this.refreshBtn.addEventListener('click', this.onClickRefreshBtn);
    this.selectBtn.addEventListener('click', this.onClickSelectBtn);
  }

  public onHide() {
    super.onHide();
    this.refreshBtn.removeEventListener('click', this.onClickRefreshBtn);
    this.selectBtn.removeEventListener('click', this.onClickSelectBtn);
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
}

class GameScene extends Scene {
  constructor() {
    super(Helper.find('.game'));
  }
}

function globalActionCreator(tile: Tile, loc: TilePoint): GameAction[] {
  const item = tile.item;
  const meta = Content.getMetaItem(item ? item.type : 0);
  const actions = [] as Array<{innerText: string, title: string, type: string}>;

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
  const {creature, loc} = e;

  switch (type) {
    case 'pickup':
      client.connection.send(ProtocolBuilder.moveItem({
        fromSource: 0,
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

  controller.showScene(new GameScene());
}

const controller = new MainController();
document.addEventListener('DOMContentLoaded', async () => {
  setupDebugging();
  await Content.loadContentFromNetwork();
  controller.showScene(new StartScene());
});
