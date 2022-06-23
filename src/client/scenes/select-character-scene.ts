import {initializeWorldData} from '../../content.js';
import * as Helper from '../helper.js';
import {makeSelectCharacterComponent} from '../ui/scenes/select-character.js';

import {SceneController} from './scene-controller.js';
import {Scene} from './scene.js';

export class SelectCharacterScene extends Scene {
  constructor(private controller: SceneController, private loginData: Protocol.Commands.Login['response']) {
    super(Helper.find('.select-character'));

    this.controller.client.account = this.loginData.account;
  }

  onShow() {
    super.onShow();

    initializeWorldData(this.loginData.worldData).then(() => {
      this.element.append(makeSelectCharacterComponent({controller: this.controller, loginData: this.loginData}));
    });
  }

  onHide() {
    super.onHide();

    this.element.innerText = '';
  }

  getExistingPlayers() {
    return this.loginData.players;
  }

  onDestroy() {
    this.controller.destoryClient();
  }
}
