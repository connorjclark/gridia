import * as PIXI from 'pixi.js';
import * as Content from '../content';
import { makeGame } from '../game-singleton';
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
const PIXISound: typeof import('pixi-sound').default = require('pixi-sound').default;

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
    console.log('For debugging:\nwindow.Gridia.verbose = true;');
    return;
  }

  const serverAndWire = await openAndConnectToServerInMemory(client, {
    dummyDelay: 20,
    verbose: false,
  });

  setInterval(() => {
    serverAndWire.server.tick();
  }, 50);

  client.wire = serverAndWire.clientToServerWire;
  // @ts-ignore
  window.Gridia.server = serverAndWire.server;
  console.log('For debugging:\nwindow.Gridia.server.verbose = true;');
}

document.addEventListener('DOMContentLoaded', async () => {
  await createWire();

  const registerBtn = Helper.find('.register-btn');
  registerBtn.addEventListener('click', () => {
    client.wire.send('register', {
      name: '@@@Player',
    });
  });

  // Wait for initialize message. This happens after a successful login.
  await new Promise((resolve, reject) => {
    client.eventEmitter.once('message', (e) => {
      if (e.type === 'initialize') resolve();
      else reject(`first message should be initialize, but got ${JSON.stringify(e)}`);
    });
  });
  const gameSingleton = makeGame(client);

  // TODO: AdminClientModule should create the panel. Until then, manually remove panel.
  if (!client.isAdmin) {
    document.querySelector('.panels__tab[data-panel="admin"]').remove();
  }

  const moduleClasses = [
    client.isAdmin ? AdminClientModule : null,
    MovementClientModule,
    SettingsClientModule,
    SkillsClientModule,
  ].filter(Boolean);
  for (const moduleClass of moduleClasses) {
    gameSingleton.addModule(new moduleClass(gameSingleton));
  }
  gameSingleton.addActionCreator(globalActionCreator);
  client.eventEmitter.on('Action', globalOnActionHandler);

  gameSingleton.start();
  // @ts-ignore
  window.Gridia.game = gameSingleton;

  Helper.find('.register').classList.add('hidden');
  Helper.find('.game').classList.remove('hidden');
});
