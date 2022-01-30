import {initializeWorldData} from '../../content.js';
import * as Helper from '../helper.js';
import {makeSelectCharacterComponent} from '../ui/scenes/select-character.js';

import {SceneController} from './scene-controller.js';
import {Scene} from './scene.js';

export class SelectCharacterScene extends Scene {
  constructor(private controller: SceneController, private loginData: Protocol.Commands.Login['response']) {
    super(Helper.find('.select-character'));

    this.controller.client.account = this.loginData.account;
    this.load();
  }

  async load() {
    await initializeWorldData(this.loginData.worldData);
    this.element.append(makeSelectCharacterComponent({controller: this.controller, loginData: this.loginData}));
  }

  getExistingPlayers() {
    return this.loginData.players;
  }

  onDestroy() {
    this.controller.destoryClient();
  }
}
