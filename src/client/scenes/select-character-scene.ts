import * as Player from '../../player';
import * as CommandBuilder from '../../protocol/command-builder';
import * as Helper from '../helper';
import {makeCustomCreatureGraphicComponent} from '../ui/ui-common';

import {CreateCharacterScene} from './create-character-scene';
import {Scene} from './scene';
import {SceneController} from './scene-controller';

export class SelectCharacterScene extends Scene {
  private createCharacterBtn: HTMLElement;
  private _eventAbortController = new AbortController();

  constructor(private controller: SceneController, private loginData: Protocol.Commands.Login['response']) {
    super(Helper.find('.select-character'));
    this.createCharacterBtn = Helper.find('.select-character__create-character-btn', this.element);
    this.onClickCreateCharacterBtn = this.onClickCreateCharacterBtn.bind(this);
    this.createCharacterBtn.addEventListener(
      'click', this.onClickCreateCharacterBtn, {signal: this._eventAbortController.signal});
    this.load();
  }

  load() {
    const playersEl = Helper.find('.select-character__players', this.element);
    playersEl.innerHTML = '';
    for (const [i, player] of Object.entries(this.loginData.players)) {
      const el = Helper.createChildOf(playersEl, 'div', 'select-character__player');
      el.dataset.index = i;
      el.append(makeCustomCreatureGraphicComponent(this.loginData.imageDatas[Number(i)]));
      const div2 = Helper.createChildOf(el, 'div');
      Helper.createChildOf(div2, 'div').textContent = player.name;
      Helper.createChildOf(div2, 'div').textContent = `Combat Level: ${Player.getCombatLevel(player).combatLevel}`;
    }
    playersEl.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const playerEl = target.closest('.select-character__player') as HTMLElement;
      if (!playerEl) return;

      const index = Number(playerEl.dataset.index);
      const player = this.loginData.players[index];
      await this.selectPlayer(player.id);
    }, {signal: this._eventAbortController.signal});
  }

  async selectPlayer(playerId: string) {
    try {
      await this.controller.client.connection.sendCommand(CommandBuilder.enterWorld({
        playerId,
      }));
      this.controller.startGame();
    } catch (error) {
      // TODO: UI
      console.error(error);
    }
  }

  onClickCreateCharacterBtn() {
    this.controller.pushScene(new CreateCharacterScene(this.controller));
  }

  onShow() {
    super.onShow();
  }

  onHide() {
    super.onHide();
  }

  onDestroy() {
    this.controller.destoryClient();
    this._eventAbortController.abort();
  }
}
