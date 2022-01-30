import {h, render} from 'preact';

import * as Player from '../../../player.js';
import * as Helper from '../../helper.js';
import {CreateCharacterScene} from '../../scenes/create-character-scene.js';
import {SceneController} from '../../scenes/scene-controller.js';
import {CustomCreatureGraphic} from '../components/graphic.js';

interface Props {
  controller: SceneController;
  loginData: Protocol.Commands.Login['response'];
}

export const SelectCharacter = (props: Props) => {
  return <div>
    <div class="flex flex-column items-center">
      <button
        class="select-character__create-character-btn button--primary"
        onClick={() => props.controller.pushScene(new CreateCharacterScene(props.controller))}
      >Create New Character</button>

      <h1>Existing Characters</h1>
      <div class="select-character__players">
        {props.loginData.players.map((player, i) => {
          return <div class="select-character__player" onClick={() => props.controller.selectPlayer(player.id)}>
            <CustomCreatureGraphic graphics={props.loginData.equipmentGraphics[i]} scale={1.5}></CustomCreatureGraphic>
            <div>
              <div>{player.name}</div>
              <div>Combat Level: {Player.getCombatLevel(player).combatLevel}</div>
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
};

export function makeSelectCharacterComponent(props: Props) {
  const el = Helper.createElement('div');
  render(<SelectCharacter {...props} />, el);
  return el;
}
