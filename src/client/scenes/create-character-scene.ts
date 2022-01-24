import * as Helper from '../helper.js';
import {makeCharacterCreateComponent} from '../ui/scenes/character-create.js';

import {SceneController} from './scene-controller.js';
import {Scene} from './scene.js';

export class CreateCharacterScene extends Scene {
  constructor(controller: SceneController) {
    super(Helper.find('.create-character'));
    this.element.append(makeCharacterCreateComponent(controller));
  }
}
