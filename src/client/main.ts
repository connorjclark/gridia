import * as PIXI from 'pixi.js';
import * as Content from '../content';
import { game, makeGame } from '../game-singleton';
import { worldToTile as _worldToTile } from '../utils';
import Client from './client';
import { connect, openAndConnectToServerInMemory } from './connect-to-server';
import * as Helper from './helper';
import AdminClientModule from './modules/admin-module';
import MovementClientModule from './modules/movement-module';
import SettingsClientModule from './modules/settings-module';
import SkillsClientModule from './modules/skills-module';

// pixi-sound needs to load after PIXI. The linter reorders imports in a way
// that breaks that requirement. So require here.
// @ts-ignore - https://github.com/pixijs/pixi-sound/issues/99
const PIXISound: typeof import('pixi-sound') = require('pixi-sound').default;

const client = new Client();
client.PIXI = PIXI;
client.PIXISound = PIXISound;

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

  if (meta.class === 'Ball') {
    actions.push({
      type: 'throw',
      innerText: 'Throw ball',
      title: 'Throw ball',
    });
  }

  const tool = Helper.getSelectedTool();
  if (tool && Helper.usageExists(tool.type, meta.id)) {
    actions.push({
      type: 'use-tool',
      innerText: `Use ${Content.getMetaItem(tool.type).name}`,
      title: 'Shortcut: Spacebar',
    });
  }

  if (tile.creature) {
    actions.push({
      type: 'tame',
      innerText: 'Tame',
      title: '',
    });
  }

  return actions;
}

function globalOnActionHandler(e: GameActionEvent) {
  const type = e.action.type;
  const {creature, loc} = e;

  switch (type) {
    case 'pickup':
      client.wire.send('moveItem', {
        fromSource: 0,
        from: loc,
        toSource: client.containerId,
      });
      break;
    case 'use-hand':
      Helper.useHand(loc);
      break;
    case 'use-tool':
      Helper.useTool(loc);
      break;
    case 'open-container':
      Helper.openContainer(loc);
      break;
    case 'tame':
      client.wire.send('tame', {
        creatureId: creature.id,
      });
      break;
    case 'throw':
      // TODO
      break;
  }
}

async function createWire() {
  let connectOverSocket = !window.location.hostname.includes('localhost');
  if (window.location.search.includes('socket')) {
    connectOverSocket = true;
  } else if (window.location.search.includes('memory')) {
    connectOverSocket = false;
  }

  if (connectOverSocket) {
    client.wire = await connect(client, 9001);
    return;
  }

  const serverAndWire = openAndConnectToServerInMemory(client, {
    dummyDelay: 20,
    verbose: true,
  });

  setInterval(() => {
    serverAndWire.server.tick();
  }, 50);

  client.wire = serverAndWire.clientToServerWire;
}

document.addEventListener('DOMContentLoaded', async () => {
  await createWire();
  const gameSingleton = makeGame(client);
  // @ts-ignore
  window.Gridia.game = gameSingleton;

  const moduleClasses = [
    AdminClientModule,
    MovementClientModule,
    SettingsClientModule,
    SkillsClientModule,
  ];
  for (const moduleClass of moduleClasses) {
    gameSingleton.addModule(new moduleClass(gameSingleton));
  }
  gameSingleton.addActionCreator(globalActionCreator);
  client.eventEmitter.on('Action', globalOnActionHandler);

  gameSingleton.start();
});
