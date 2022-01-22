import * as Content from '../content.js';
import * as CommandBuilder from '../protocol/command-builder.js';

import {connectToServer} from './connect-to-server.js';
import * as Helper from './helper.js';
import {AccountScene} from './scenes/account-scene.js';
import {MapSelectScene} from './scenes/map-select-scene.js';
import {SceneController} from './scenes/scene-controller.js';
import {Scene} from './scenes/scene.js';
import {SelectCharacterScene} from './scenes/select-character-scene.js';

class StartScene extends Scene {
  private localBtn: HTMLElement;
  private connectBtn: HTMLElement;
  private serverLocationInput: HTMLInputElement;

  constructor(private controller: SceneController) {
    super(Helper.find('.start-scene'));
    this.localBtn = Helper.find('.start-scene__button--local', this.element);
    this.connectBtn = Helper.find('.start-scene__button--connect', this.element);
    this.serverLocationInput = Helper.find('#start-scene__input--server-location', this.element) as HTMLInputElement;
    this.onClickLocalBtn = this.onClickLocalBtn.bind(this);
    this.onClickConnectBtn = this.onClickConnectBtn.bind(this);

    this.serverLocationInput.value = `${window.location.hostname}:9001`;
  }

  async onClickLocalBtn() {
    await this.controller.loadWorker();
    this.controller.pushScene(new MapSelectScene(this.controller));
    await window.document.documentElement.requestFullscreen().catch(console.error);
  }

  async onClickConnectBtn() {
    const serverUrl = this.serverLocationInput.value;
    this.controller.client = await this.createClientForServer(serverUrl);
    this.controller.client.connection.artificalSendDelayMs = this.controller.qs.latency ?? 0;
    this.controller.pushScene(new AccountScene(this.controller));
    // TODO: Back doesn't work here.
    Helper.find('.scene-controller').classList.add('hidden');
    await window.document.documentElement.requestFullscreen().catch(console.error);
  }

  onShow() {
    super.onShow();
    this.localBtn.addEventListener('click', this.onClickLocalBtn);
    this.connectBtn.addEventListener('click', this.onClickConnectBtn);
    Helper.find('.scene-controller').classList.add('hidden');
  }

  onHide() {
    super.onHide();
    this.localBtn.removeEventListener('click', this.onClickLocalBtn);
    this.connectBtn.removeEventListener('click', this.onClickConnectBtn);
    Helper.find('.scene-controller').classList.remove('hidden');
  }

  private createClientForServer(hostnameAndPort: string) {
    const [hostname, port] = hostnameAndPort.split(':', 2);

    let useWebRTC;
    if (this.controller.qs.connection === 'ws') {
      useWebRTC = false;
    } else if (this.controller.qs.connection === 'wrtc') {
      useWebRTC = true;
    } else {
      // TODO: defaulting to websocket for now.
      // useWebRTC = Boolean(window.RTCPeerConnection);
    }

    try {
      if (useWebRTC) {
        return connectToServer({
          type: 'webrtc',
          hostname,
          port: Number(port),
        });
      }
    } catch (err) {
      console.error(err);
    }

    return connectToServer({
      type: 'ws',
      hostname,
      port: Number(port),
    });
  }
}

function setupDebugging(controller: SceneController) {
  // @ts-expect-error
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
        // @ts-expect-error
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

document.addEventListener('DOMContentLoaded', async () => {
  const controller = new SceneController();
  // @ts-expect-error
  window.gridiaController = controller;
  setupDebugging(controller);

  if (controller.qs.quick === 'server') {
    controller.pushScene(new StartScene(controller));
    await (controller.currentScene as StartScene).onClickConnectBtn();
    if (controller.qs.playerId) {
      (controller.currentScene as SelectCharacterScene).selectPlayer(controller.qs.playerId);
    }
  } else if (controller.qs.quick === 'local') {
    const type = controller.qs.type || 'rpgwo';
    if (!Content.WORLD_DATA_DEFINITIONS[type]) throw new Error('unknown type: ' + type);

    await controller.loadWorker();

    // Create map.
    const mapName = controller.qs.map || `quick-default (${type})`;
    const mapNames = await controller.getMapNames();
    if (!mapNames.includes(mapName)) {
      await controller.serverWorker.generateMap({
        bare: true,
        width: 100,
        height: 100,
        depth: 1,
        seeds: {},
        worldDataDefinition: Content.WORLD_DATA_DEFINITIONS[type],
      });
      await controller.serverWorker.saveGeneratedMap({name: mapName});
    }

    // Select map.
    await new MapSelectScene(controller).loadMap(controller.qs.map || mapName);

    // Create player / enter world as player.
    const players = (controller.currentScene as SelectCharacterScene).getExistingPlayers();
    const playerName = controller.qs.playerId || 'Quicksilver'; // TODO ...
    const existingPlayer = playerName && players.find((p) => p.name === playerName);
    if (existingPlayer) {
      (controller.currentScene as SelectCharacterScene).selectPlayer(existingPlayer.id);
    } else {
      await controller.client.connection.sendCommand(CommandBuilder.createPlayer({
        name: playerName,
        attributes: new Map(),
        skills: new Set(),
      }));
      controller.startGame();
    }
  } else {
    controller.pushScene(new StartScene(controller));
  }
});
