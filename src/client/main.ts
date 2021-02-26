import * as Content from '../content';
import { makeGame, game } from '../game-singleton';
import * as ProtocolBuilder from '../protocol/client-to-server-protocol-builder';
import * as Utils from '../utils';
import Client from './client';
import { connect, connectToServerWorker } from './connect-to-server';
import { GameActionEvent } from './event-emitter';
import * as Helper from './helper';
import { createMapSelectForm } from './scenes/map-select-scene';
import { ServerWorker } from './server-worker';

function parseQuery(queryString: string) {
  const params = new URLSearchParams(queryString ? queryString.substr(1) : '');
  return {
    map: params.get('map'),
    quick: params.get('quick'),
    latency: params.has('latency') ? Number(params.get('latency')) : undefined,
  };
}

const qs = parseQuery(window.location.search);

class MainController {
  private scenes: Scene[] = [];
  private client_: Client | null = null;
  private serverWorker_: ServerWorker | null = null;

  pushScene(newScene: Scene) {
    if (this.currentScene) this.currentScene.onHide();
    this.scenes.push(newScene);
    newScene.onShow();
  }

  popScene() {
    if (this.currentScene) {
      this.currentScene.onHide();
      this.currentScene.onDestroy();
      this.scenes.pop();
    }
    this.currentScene.onShow();
  }

  async loadWorker() {
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

  destoryClient() {
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

  onShow() {
    this.element.classList.remove('hidden');
  }

  onHide() {
    this.element.classList.add('hidden');
  }

  onDestroy() {
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

  async onClickLocalBtn() {
    await controller.loadWorker();
    controller.pushScene(new MapSelectScene());
  }

  async onClickConnectBtn() {
    const serverUrl = this.serverLocationInput.value;
    loadLocalStorageData(`server-${name}`);
    controller.client = await createClientForServer(serverUrl);
    controller.pushScene(new RegisterScene());
  }

  onShow() {
    super.onShow();
    this.localBtn.addEventListener('click', this.onClickLocalBtn);
    this.connectBtn.addEventListener('click', this.onClickConnectBtn);
  }

  onHide() {
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

  async renderMapSelection() {
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

  async generateMap(opts: any) {
    if (this.loadingPreview) return;
    this.loadingPreview = true;

    const canvas = document.createElement('canvas');
    const offscreen = canvas.transferControlToOffscreen();
    await generateMap(opts, offscreen).finally(() => this.loadingPreview = false);

    this.previewEl.innerHTML = '';
    this.previewEl.append(canvas);
    this.selectBtn.classList.remove('hidden');
  }

  async onClickSelectBtn() {
    const name = `/default-world-${this.mapListEl.childElementCount}`;
    await controller.serverWorker.saveGeneratedMap({ name });
    loadLocalStorageData(`worker-${name}`);
    controller.client = await connectToServerWorker(controller.serverWorker, {
      serverData: name,
      dummyDelay: qs.latency ?? 0,
      verbose: false,
    });
    controller.pushScene(new RegisterScene());
  }

  onSelectMap(e: Event) {
    // TODO: this is annoying.
    if (!(e.target instanceof HTMLElement)) return;

    const name = e.target.getAttribute('data-name') || '';
    loadMap(name);
  }

  onShow() {
    super.onShow();
    this.selectBtn.addEventListener('click', this.onClickSelectBtn);
    this.mapListEl.addEventListener('click', this.onSelectMap);
    this.loadingPreview = false;
    this.previewEl.innerHTML = '';
    this.selectBtn.classList.add('hidden');
    this.renderMapSelection();
    createMapSelectForm(this.inputFormEl, this.generateMap.bind(this));
  }

  onHide() {
    super.onHide();
    this.selectBtn.removeEventListener('click', this.onClickSelectBtn);
    this.mapListEl.removeEventListener('click', this.onSelectMap);
  }
}

interface LocalStorageData {
  players: Array<{ name: string; password: string }>;
}

let localStorageKey = '';
let localStorageData: LocalStorageData;
function loadLocalStorageData(key: string) {
  localStorageKey = key;

  let data = {
    players: [],
  };

  const json = localStorage.getItem(`local-gridia-data-${key}`);
  if (json) {
    try {
      data = JSON.parse(json);
    } catch (e) {
      console.error(e);
    }
  }

  localStorageData = data;
}
function saveLocalStorageData() {
  localStorage.setItem(`local-gridia-data-${localStorageKey}`, JSON.stringify(localStorageData));
}

class RegisterScene extends Scene {
  private registerBtn: HTMLElement;
  private nameInput: HTMLInputElement;

  constructor() {
    super(Helper.find('.register'));
    this.registerBtn = Helper.find('.register-btn', this.element);
    this.nameInput = Helper.find('#register--name', this.element) as HTMLInputElement;
    this.onClickRegisterBtn = this.onClickRegisterBtn.bind(this);

    const playersEl = Helper.find('.register__players', this.element);
    for (const [i, player] of Object.entries(localStorageData.players)) {
      const el = Helper.createChildOf(playersEl, 'div', 'register__player');
      el.textContent = player.name;
      el.dataset.index = i;
    }
    playersEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const playerEl = target.closest('.register__player') as HTMLElement;
      if (!playerEl) return;

      const index = Number(playerEl.dataset.index);
      const player = localStorageData.players[index];
      controller.client.connection.send(ProtocolBuilder.login(player));
      this.waitForInitializeThenStartGame();
    });

    const parts1 = 'Small Smelly Quick Steely Quiet'.split(' ');
    const parts2 = 'Jill Stranger Arthur Maz Harlet Worker'.split(' ');
    this.nameInput.value = [
      parts1[Utils.randInt(0, parts1.length - 1)],
      parts2[Utils.randInt(0, parts2.length - 1)],
      Utils.randInt(1, 1000),
    ].join(' ');
  }

  onClickRegisterBtn() {
    const name = this.nameInput.value;
    const password = [...Array(20)].map(() => String.fromCharCode(65 + Math.floor(Math.random() * 52))).join('');
    controller.client.connection.send(ProtocolBuilder.register({
      name,
      password,
    }));

    localStorageData.players.push({ name, password });
    saveLocalStorageData();
    this.waitForInitializeThenStartGame();
  }

  async waitForInitializeThenStartGame() {
    // Wait for initialize message. This happens after a successful login.
    await new Promise((resolve, reject) => {
      controller.client.eventEmitter.once('message', (e) => {
        if (e.type === 'initialize') resolve();
        else reject(`first message should be initialize, but got ${JSON.stringify(e)}`);
      });
    });

    startGame(controller.client);
  }

  onShow() {
    super.onShow();
    this.registerBtn.addEventListener('click', this.onClickRegisterBtn);
  }

  onHide() {
    super.onHide();
    this.registerBtn.removeEventListener('click', this.onClickRegisterBtn);
  }

  onDestroy() {
    controller.destoryClient();
  }
}

class GameScene extends Scene {
  constructor() {
    super(Helper.find('.game'));
  }

  onShow() {
    super.onShow();

    // Once in game, too complicated to go back. For now, must refresh the page.
    Helper.find('.scene-controller').classList.add('hidden');
  }
}

function globalActionCreator(location: ItemLocation): GameAction[] {
  let item;
  let creature;
  if (location.source === 'world') {
    const tile = game.client.context.map.getTile(location.loc);
    item = tile.item;
    creature = tile.creature;
  } else {
    const container = game.client.context.containers.get(location.id);
    if (!container || location.index === undefined) return [];

    item = container.items[location.index];
  }

  const isInInventory = item && location.source === 'container' && location.id === game.client.player.containerId;

  const meta = Content.getMetaItem(item ? item.type : 0);
  const actions: GameAction[] = [];

  if (creature) {
    if (!creature.isPlayer) {
      actions.push({
        type: 'attack',
        innerText: 'Attack',
        title: 'Attack',
      });
    }

    if (!creature.tamedBy && !creature.isPlayer) {
      actions.push({
        type: 'tame',
        innerText: 'Tame',
        title: 'Tame',
      });
    }

    return actions;
  }

  if (item && meta.moveable) {
    if (location.source === 'world') {
      actions.push({
        type: 'pickup',
        innerText: 'Pickup',
        title: 'Shortcut: Shift',
      });
    } else if (!isInInventory) {
      actions.push({
        type: 'pickup',
        innerText: 'Take',
        title: '',
      });
    }
  }

  if (item && meta.equipSlot && isInInventory) {
    actions.push({
      type: 'equip',
      innerText: 'Equip',
      title: '',
    });
  }

  if (item && meta.moveable && meta.stackable && item.quantity > 1) {
    actions.push({
      type: 'split',
      innerText: 'Split',
      title: '',
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

  // Create an action for every applicable item in inventory that could be used as a tool.
  const inventory = Helper.getInventory();
  for (const [index, tool] of Object.entries(inventory.items)) {
    if (!tool) continue;

    if (Helper.usageExists(tool.type, meta.id)) {
      actions.push({
        type: 'use-tool',
        innerText: `Use ${Content.getMetaItem(tool.type).name}`,
        title: Number(index) === Helper.getSelectedToolIndex() ? 'Shortcut: Spacebar' : '',
        extra: {
          index: Number(index),
        },
      });
    }
  }

  return actions;
}

function globalOnActionHandler(client: Client, e: GameActionEvent) {
  const type = e.action.type;
  const { creature, location, quantity } = e;

  switch (type) {
  case 'pickup':
    client.connection.send(ProtocolBuilder.moveItem({
      from: location,
      to: Utils.ItemLocation.Container(client.player.containerId),
    }));
    break;
  case 'equip':
    client.connection.send(ProtocolBuilder.moveItem({
      from: location,
      to: Utils.ItemLocation.Container(client.player.equipmentContainerId),
    }));
    break;
  case 'split':
    client.connection.send(ProtocolBuilder.moveItem({
      from: location,
      quantity: quantity || 1,
      to: Utils.ItemLocation.Container(client.player.containerId),
    }));
    break;
  case 'use-hand':
    if (location.source === 'world') Helper.useHand(location.loc);
    break;
  case 'use-tool':
    if (location.source === 'world') Helper.useTool(location.loc, { toolIndex: e.action.extra.index });
    break;
  case 'open-container':
    if (location.source === 'world') Helper.openContainer(location.loc);
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
  const { mapNames } = await controller.serverWorker.listMaps();
  return mapNames;
}

async function loadMap(name: string) {
  controller.client = await connectToServerWorker(controller.serverWorker, {
    serverData: `/${name}`,
    dummyDelay: qs.latency ?? 0,
    verbose: false,
  });
  loadLocalStorageData(`worker-${name}`);
  controller.pushScene(new RegisterScene());
}

function generateMap(opts: any, offscreenCanvas?: OffscreenCanvas) {
  return controller.serverWorker.generateMap({
    ...opts,
    canvas: offscreenCanvas,
  });
}

function startGame(client: Client) {
  const gameSingleton = makeGame(client);

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
    (controller.currentScene as RegisterScene).onClickRegisterBtn();
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
      await controller.serverWorker.saveGeneratedMap({ name: '/quick-default' });
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
