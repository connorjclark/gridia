import * as idbKeyval from 'idb-keyval';
import { string } from 'yargs';
import { CREATE_CHARACTER_ATTRIBUTES, CREATE_CHARACTER_SKILL_POINTS } from '../constants';
import * as Content from '../content';
import { makeGame, game } from '../game-singleton';
import { ATTRIBUTES } from '../player';
import * as CommandBuilder from '../protocol/command-builder';
import * as Utils from '../utils';
import Client from './client';
import { connectWithWebSocket, connectToServerWorker, connectWithWebRTC } from './connect-to-server';
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
    connection: params.get('connection'),
  };
}

const qs = parseQuery(window.location.search);

class MainController {
  private scenes: Scene[] = [];
  private client_: Client | null = null;
  private serverWorker_: ServerWorker | null = null;
  private backBtn_ = Helper.find('.scene-controller--back-btn');

  constructor() {
    this.backBtn_.addEventListener('click', () => {
      this.popScene();
    });
    this.setBackButtonClass();
  }

  pushScene(newScene: Scene) {
    if (this.currentScene) this.currentScene.onHide();
    this.scenes.push(newScene);
    newScene.onShow();
    this.setBackButtonClass();
  }

  popScene() {
    if (this.currentScene) {
      this.currentScene.onHide();
      this.currentScene.onDestroy();
      this.scenes.pop();
    }
    this.currentScene.onShow();
    this.setBackButtonClass();
  }

  async loadWorker() {
    if (this.serverWorker_) return;

    let directoryHandle: FileSystemDirectoryHandle | undefined;
    if (self.showDirectoryPicker) {
      directoryHandle = await idbKeyval.get('gridia-directory');
      if (!directoryHandle) {
        directoryHandle = await self.showDirectoryPicker();
        if (!directoryHandle) throw new Error('did not get folder');
      }
      if (await directoryHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        const permissionState = await directoryHandle.requestPermission({ mode: 'readwrite' });
        if (permissionState !== 'granted') throw new Error('did not get permission');
      }
      idbKeyval.set('gridia-directory', directoryHandle);
    }

    this.serverWorker_ = new ServerWorker();
    await this.serverWorker_.init({ directoryHandle });
  }

  destoryWorker() {
    this.serverWorker_?.close();
    this.serverWorker_ = null;
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

  private setBackButtonClass() {
    const shouldHide = this.scenes.length <= 1 ||
      this.currentScene.element.classList.contains('register');
    this.backBtn_.classList.toggle('hidden', shouldHide);
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
    // TODO
    loadLocalStorageData('server-');
    controller.client = await createClientForServer(serverUrl);
    controller.pushScene(new SelectCharacterScene());
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
    const offscreen = canvas.transferControlToOffscreen && canvas.transferControlToOffscreen();
    await generateMap(opts, offscreen).finally(() => this.loadingPreview = false);

    this.previewEl.innerHTML = '';
    this.previewEl.append(canvas);
    this.selectBtn.classList.remove('hidden');
  }

  async onClickSelectBtn() {
    const name = `default-world-${this.mapListEl.childElementCount}`;
    await controller.serverWorker.saveGeneratedMap({ name });
    loadLocalStorageData(`worker-${name}`);
    controller.client = await connectToServerWorker(controller.serverWorker, {
      mapName: name,
      dummyDelay: qs.latency ?? 0,
      verbose: false,
    });
    controller.pushScene(new SelectCharacterScene());
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

  onDestroy() {
    super.onDestroy();
    controller.destoryWorker();
  }
}

interface LocalStorageData {
  username?: string;
  password?: string;
}

let localStorageKey = '';
let localStorageData: LocalStorageData;
function loadLocalStorageData(key: string) {
  localStorageKey = key;

  let data = {};

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

class SelectCharacterScene extends Scene {
  private createCharacterBtn: HTMLElement;

  constructor() {
    super(Helper.find('.select-character'));
    this.createCharacterBtn = Helper.find('.select-character__create-character-btn', this.element);
    this.onClickCreateCharacterBtn = this.onClickCreateCharacterBtn.bind(this);

    this.load();
  }

  async load() {
    let username = localStorageData.username;
    let password = localStorageData.password;

    if (!username || !password) {
      localStorageData.username = username = Utils.uuid().substr(0, 20);
      localStorageData.password = password = Utils.uuid();
      await controller.client.connection.sendCommand(CommandBuilder.registerAccount({
        username,
        password,
      }));
      saveLocalStorageData();
    }

    let players: Protocol.Commands.Login['response']['players'];
    try {
      const response = await controller.client.connection.sendCommand(CommandBuilder.login({
        username,
        password,
      }));
      players = response.players;
    } catch (error) {
      console.error(error);

      localStorageData.username = username = Utils.uuid().substr(0, 20);
      localStorageData.password = password = Utils.uuid();
      await controller.client.connection.sendCommand(CommandBuilder.registerAccount({
        username,
        password,
      }));
      saveLocalStorageData();
      const response = await controller.client.connection.sendCommand(CommandBuilder.login({
        username,
        password,
      }));
      players = response.players;
    }

    const playersEl = Helper.find('.select-character__players', this.element);
    for (const [i, player] of Object.entries(players)) {
      const el = Helper.createChildOf(playersEl, 'div', 'select-character__player');
      el.textContent = player.name;
      el.dataset.index = i;
    }
    playersEl.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const playerEl = target.closest('.select-character__player') as HTMLElement;
      if (!playerEl) return;

      const index = Number(playerEl.dataset.index);
      const player = players[index];

      try {
        await controller.client.connection.sendCommand(CommandBuilder.enterWorld({
          playerId: player.id,
        }));
        startGame(controller.client);
      } catch (error) {
        // TODO: UI
        console.error(error);
      }
    });
  }

  onClickCreateCharacterBtn() {
    controller.pushScene(new CreateCharacterScene());
  }

  onShow() {
    super.onShow();
    this.createCharacterBtn.addEventListener('click', this.onClickCreateCharacterBtn);
  }

  onHide() {
    super.onHide();
    this.createCharacterBtn.removeEventListener('click', this.onClickCreateCharacterBtn);
  }

  onDestroy() {
    controller.destoryClient();
  }
}

class CreateCharacterScene extends Scene {
  private createBtn: HTMLElement;
  private nameInput: HTMLInputElement;
  private attributeEls: Record<string, HTMLInputElement> = {};
  private selectedSkills = new Set<number>();

  constructor() {
    super(Helper.find('.create-character'));
    this.createBtn = Helper.find('.create-btn', this.element);
    this.nameInput = Helper.find('#create--name', this.element) as HTMLInputElement;
    this.onClickCreateBtn = this.onClickCreateBtn.bind(this);

    const parts1 = 'Small Smelly Quick Steely Quiet'.split(' ');
    const parts2 = 'Jill Stranger Arthur Maz Harlet Worker'.split(' ');
    this.nameInput.value = [
      parts1[Utils.randInt(0, parts1.length - 1)],
      parts2[Utils.randInt(0, parts2.length - 1)],
      Utils.randInt(1, 1000),
    ].join(' ');

    let attributePoints = CREATE_CHARACTER_ATTRIBUTES;
    const updateAttributes = () => {
      attributePoints = CREATE_CHARACTER_ATTRIBUTES;
      for (const attribute of Object.values(this.attributeEls)) {
        attributePoints -= attribute.valueAsNumber;
      }

      Helper.find('.create--attribute-points', this.element).textContent = attributePoints.toLocaleString();
    };

    const attributesSorted = Helper.sortByPrecedence([...ATTRIBUTES], [
      { type: 'equal', value: 'life' },
      { type: 'equal', value: 'mana' },
      { type: 'equal', value: 'stamina' },
    ]);

    const attributesEl = Helper.find('.create--attributes', this.element);
    for (const attribute of attributesSorted) {
      const el = Helper.createChildOf(attributesEl, 'div', 'create--attribute');
      const el2 = Helper.createChildOf(el, 'div');
      Helper.createChildOf(el2, 'div').textContent = attribute;
      this.attributeEls[attribute] = Helper.createChildOf(el2, 'input', '', {
        type: 'range',
        value: '100',
        min: '10',
        max: '200',
      });
      const valueEl = Helper.createChildOf(el, 'div');
      valueEl.textContent = this.attributeEls[attribute].value;
      this.attributeEls[attribute].addEventListener('input', () => {
        updateAttributes();
        if (attributePoints < 0) {
          this.attributeEls[attribute].valueAsNumber += attributePoints;
          updateAttributes();
        }

        valueEl.textContent = this.attributeEls[attribute].value;
      });
    }

    const skillsByCategory = new Map<string, number[]>();
    for (const skill of Content.getSkills()) {
      const skills = skillsByCategory.get(skill.category) || [];
      skills.push(skill.id);
      skillsByCategory.set(skill.category, skills);
    }

    const skillsByCategoryOrdered = Helper.sortByPrecedence([...skillsByCategory.entries()], [
      { type: 'predicate', fn: (kv) => kv[0] === 'combat basics' },
      { type: 'predicate', fn: (kv) => kv[0] === 'combat' },
      { type: 'predicate', fn: (kv) => kv[0] === 'magic' },
      { type: 'predicate', fn: (kv) => kv[0] === 'crafts' },
    ]);

    const requiredSkills = [
      Content.getSkillByNameOrThrowError('Melee Defense'),
      Content.getSkillByNameOrThrowError('Run'),
    ];

    const skillsEl = Helper.find('.create--skills', this.element);
    for (const [category, skills] of skillsByCategoryOrdered) {
      const categoryEl = Helper.createChildOf(skillsEl, 'div', 'create--skill-category');
      Helper.createChildOf(categoryEl, 'h3').textContent = category;
      for (const id of skills) {
        const skill = Content.getSkill(id);
        const el = Helper.createChildOf(categoryEl, 'div', 'create--skill flex tooltip-on-hover');
        Helper.createChildOf(el, 'div').textContent = `${skill.name} (${skill.skillPoints})`;
        const required = requiredSkills.includes(skill);
        if (required) {
          el.classList.add('selected');
          Helper.createChildOf(categoryEl, 'div', 'tooltip').textContent = skill.description + ' (required)';
        } else {
          Helper.createChildOf(categoryEl, 'div', 'tooltip').textContent = skill.description;
        }
        if (required) continue;

        el.addEventListener('click', () => {
          let selected = this.selectedSkills.has(id);
          if (selected) {
            this.selectedSkills.delete(id);
            selected = false;
          } else if (skillPoints >= skill.skillPoints) {
            this.selectedSkills.add(id);
            selected = true;
          }
          el.classList.toggle('selected', selected);
          updateSkillPoints();
        });
      }
    }

    let skillPoints = CREATE_CHARACTER_SKILL_POINTS;
    const updateSkillPoints = () => {
      skillPoints = CREATE_CHARACTER_SKILL_POINTS;
      for (const id of this.selectedSkills) {
        skillPoints -= Content.getSkill(id).skillPoints;
      }

      Helper.find('.create--skill-points', this.element).textContent = skillPoints.toLocaleString();
    };

    for (const skill of requiredSkills) {
      this.selectedSkills.add(skill.id);
      for (const el of Helper.findAll('.create--skill.selected')) {
        el.classList.add('required');
      }
    }

    updateAttributes();
    updateSkillPoints();
  }

  async onClickCreateBtn() {
    const name = this.nameInput.value;

    const attributes = new Map<string, number>();
    for (const [attribute, el] of Object.entries(this.attributeEls)) {
      attributes.set(attribute, el.valueAsNumber);
    }

    try {
      await controller.client.connection.sendCommand(CommandBuilder.createPlayer({
        name,
        attributes,
        skills: [...this.selectedSkills],
      }));
      saveLocalStorageData();
      startGame(controller.client);
    } catch (error) {
      // TODO: UI
      console.error(error);
    }
  }

  onShow() {
    super.onShow();
    this.createBtn.addEventListener('click', this.onClickCreateBtn);
  }

  onHide() {
    super.onHide();
    this.createBtn.removeEventListener('click', this.onClickCreateBtn);
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
    creature = game.client.context.getCreatureAt(location.loc);
  } else {
    const container = game.client.context.containers.get(location.id);
    if (!container || location.index === undefined) return [];

    item = container.items[location.index];
  }

  const isInInventory = item && location.source === 'container' && location.id === game.client.player.containerId;

  const meta = Content.getMetaItem(item ? item.type : 0);
  const actions: GameAction[] = [];

  if (creature) {
    if (creature.canSpeak) {
      actions.push({
        type: 'speak',
        innerText: 'Speak',
        title: 'Speak',
      });
    }

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
    client.connection.sendCommand(CommandBuilder.moveItem({
      from: location,
      to: Utils.ItemLocation.Container(client.player.containerId),
    }));
    break;
  case 'equip':
    client.connection.sendCommand(CommandBuilder.moveItem({
      from: location,
      to: Utils.ItemLocation.Container(client.player.equipmentContainerId),
    }));
    break;
  case 'split':
    client.connection.sendCommand(CommandBuilder.moveItem({
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
  case 'speak':
    client.connection.sendCommand(CommandBuilder.creatureAction({
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

  let useWebRTC;
  if (qs.connection === 'ws') {
    useWebRTC = false;
  } else if (qs.connection === 'wrtc') {
    useWebRTC = true;
  } else {
    // TODO: defaulting to websocket for now.
    // useWebRTC = Boolean(window.RTCPeerConnection);
  }

  try {
    if (useWebRTC) {
      return connectWithWebRTC(hostname, Number(port));
    }
  } catch (err) {
    console.error(err);
  }

  return connectWithWebSocket(hostname, Number(port));
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
    mapName: name,
    dummyDelay: qs.latency ?? 0,
    verbose: false,
  });
  loadLocalStorageData(`worker-${name}`);
  controller.pushScene(new SelectCharacterScene());
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

let controller: MainController;
document.addEventListener('DOMContentLoaded', async () => {
  controller = new MainController();
  setupDebugging();
  await Content.loadContentFromNetwork();

  if (qs.quick === 'server') {
    controller.pushScene(new StartScene());
    await (controller.currentScene as StartScene).onClickConnectBtn();
    (controller.currentScene as CreateCharacterScene).onClickCreateBtn();
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
      await controller.serverWorker.saveGeneratedMap({ name: 'quick-default' });
    }
    await loadMap(qs.map || 'quick-default');
  } else {
    controller.pushScene(new StartScene());
  }
});
