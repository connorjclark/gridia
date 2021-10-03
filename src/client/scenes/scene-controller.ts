import {Client} from '../client.js';
import * as Helper from '../helper.js';
import {ServerWorker} from '../server-worker.js';

import {GameScene} from './game-scene.js';
import {Scene} from './scene.js';

function parseQuery(queryString: string) {
  const params = new URLSearchParams(queryString ? queryString.substr(1) : '');
  return {
    map: params.get('map'),
    type: params.get('type'),
    quick: params.get('quick'),
    playerId: params.get('playerId'),
    latency: params.has('latency') ? Number(params.get('latency')) : undefined,
    connection: params.get('connection'),
  };
}

export class SceneController {
  private scenes: Scene[] = [];
  private client_: Client | null = null;
  private serverWorker_: ServerWorker | null = null;
  private backBtn_ = Helper.find('.scene-controller--back-btn');
  qs = parseQuery(window.location.search);

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

  startGame() {
    this.pushScene(new GameScene(this));
  }

  async loadWorker() {
    if (this.serverWorker_) return;

    let directoryHandle: FileSystemDirectoryHandle | undefined;
    // TODO: bring this back?
    // if (self.showDirectoryPicker) {
    //   directoryHandle = await idbKeyval.get('gridia-directory');
    //   if (!directoryHandle) {
    //     directoryHandle = await self.showDirectoryPicker();
    //     if (!directoryHandle) throw new Error('did not get folder');
    //   }
    //   if (await directoryHandle.queryPermission({mode: 'readwrite'}) !== 'granted') {
    //     const permissionState = await directoryHandle.requestPermission({mode: 'readwrite'});
    //     if (permissionState !== 'granted') throw new Error('did not get permission');
    //   }
    //   idbKeyval.set('gridia-directory', directoryHandle);
    // }

    this.serverWorker_ = new ServerWorker();
    await this.serverWorker_.init({directoryHandle});
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

  async getMapNames() {
    const {mapNames} = await this.serverWorker.listMaps();
    return mapNames;
  }

  private setBackButtonClass() {
    const shouldHide = this.scenes.length <= 1 ||
      this.currentScene.element.classList.contains('register');
    this.backBtn_.classList.toggle('hidden', shouldHide);
  }
}
