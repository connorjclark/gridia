import * as PIXI from 'pixi.js';
import * as Content from '../content';
import { worldToTile as _worldToTile } from '../utils';
import Client from './client';
import Game from './game';
import god from './god';
import * as Helper from './helper';
import MovementClientModule from './modules/movement-module';
import SettingsClientModule from './modules/settings-module';
import SkillsClientModule from './modules/skills-module';

// pixi-sound needs to load after PIXI. The linter reorders imports in a way
// that breaks that requirement. So require here.
// @ts-ignore - https://github.com/pixijs/pixi-sound/issues/99
const PIXISound: typeof import('pixi-sound') = require('pixi-sound').default;

const client = new Client();
god.client = client;
client.PIXI = PIXI;
client.PIXISound = PIXISound;

const state: UIState = {
  viewport: {
    x: 0,
    y: 0,
  },
  mouse: {
    x: 0,
    y: 0,
    state: '',
  },
  elapsedFrames: 0,
  selectedView: {},
};
god.state = state;

// @ts-ignore - for debugging
window.Gridia = {
  client,
  item(itemType: number) {
    console.log(Content.getMetaItem(itemType));
    console.log('tool', Content.getItemUsesForTool(itemType));
    console.log('focus', Content.getItemUsesForFocus(itemType));
    console.log('product', Content.getItemUsesForProduct(itemType));
  },
};

function globalActionCreator(tile: Tile, loc: TilePoint): GameAction[] {
  const item = tile.item;
  const meta = Content.getMetaItem(item ? item.type : 0);
  const actions = [] as Array<{innerText: string, title: string, type: string}>;

  if (item && meta.moveable) {
    actions.push({
      type: 'pickup',
      innerText: 'Pickup',
      title: 'Shortcut: Shift',
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

  if (state.selectedView.tile) {
    const tool = Helper.getSelectedTool();
    if (tool && Helper.usageExists(tool.type, meta.id)) {
      actions.push({
        type: 'use-tool',
        innerText: `Use ${Content.getMetaItem(tool.type).name}`,
        title: 'Shortcut: Spacebar',
      });
    }
  }

  return actions;
}

document.addEventListener('DOMContentLoaded', () => {
  const game = new Game(client);
  god.game = game;

  const moduleClasses = [
    MovementClientModule,
    SettingsClientModule,
    SkillsClientModule,
  ];
  for (const moduleClass of moduleClasses) {
    game.addModule(new moduleClass(game));
  }

  game.addActionCreator(globalActionCreator);

  game.start();
  // @ts-ignore
  window.Gridia.game = game;
});
