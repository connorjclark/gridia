import * as Content from '../content';
import { connectWithWebSocket, connectWithWebRTC } from './connect-to-server';
import * as Helper from './helper';
import { Scene } from './scenes/scene';
import { MapSelectScene } from './scenes/map-select-scene';
import { SceneController } from './scenes/scene-controller';
import { SelectCharacterScene } from './scenes/select-character-scene';

class StartScene extends Scene {
  private localBtn: HTMLElement;
  private connectBtn: HTMLElement;
  private serverLocationInput: HTMLInputElement;

  constructor(private controller: SceneController) {
    super(Helper.find('.start'));
    this.localBtn = Helper.find('.start--local-btn', this.element);
    this.connectBtn = Helper.find('.start--connect-btn', this.element);
    this.serverLocationInput = Helper.find('#start--server-location', this.element) as HTMLInputElement;
    this.onClickLocalBtn = this.onClickLocalBtn.bind(this);
    this.onClickConnectBtn = this.onClickConnectBtn.bind(this);

    this.serverLocationInput.value = `${window.location.hostname}:9001`;
  }

  async onClickLocalBtn() {
    await this.controller.loadWorker();
    this.controller.pushScene(new MapSelectScene(this.controller));
  }

  async onClickConnectBtn() {
    const serverUrl = this.serverLocationInput.value;
    // TODO
    this.controller.loadLocalStorageData('server-');
    this.controller.client = await this.createClientForServer(serverUrl);
    this.controller.pushScene(new SelectCharacterScene(this.controller));
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
        return connectWithWebRTC(hostname, Number(port));
      }
    } catch (err) {
      console.error(err);
    }

    return connectWithWebSocket(hostname, Number(port));
  }
}

function setupDebugging(controller: SceneController) {
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

document.addEventListener('DOMContentLoaded', async () => {
  const controller = new SceneController();
  setupDebugging(controller);
  await Content.loadContentFromNetwork();

  if (controller.qs.quick === 'server') {
    controller.pushScene(new StartScene(controller));
    await (controller.currentScene as StartScene).onClickConnectBtn();
    if (controller.qs.playerId) {
      (controller.currentScene as SelectCharacterScene).selectPlayer(controller.qs.playerId);
    }
  } else if (controller.qs.quick === 'local') {
    await controller.loadWorker();

    const mapNames = await controller.getMapNames();
    if (!controller.qs.map && !mapNames.includes('quick-default')) {
      await controller.serverWorker.generateMap({
        bare: true,
        width: 100,
        height: 100,
        depth: 1,
        seeds: {},
      });
      await controller.serverWorker.saveGeneratedMap({ name: 'quick-default' });
    }
    new MapSelectScene(controller).loadMap(controller.qs.map || 'quick-default');
  } else {
    controller.pushScene(new StartScene(controller));
  }
});
