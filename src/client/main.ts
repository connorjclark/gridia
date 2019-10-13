import * as PIXI from 'pixi.js';
import * as Content from '../content';
import { makeGame } from '../game-singleton';
import * as ProtocolBuilder from '../protocol/client-to-server-protocol-builder';
import { randInt, worldToTile as _worldToTile } from '../utils';
import Client from './client';
import { connect, openAndConnectToServerWorker } from './connect-to-server';
import { GameActionEvent } from './event-emitter';
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

  if (tile.creature && !tile.creature.tamedBy && !tile.creature.isPlayer) {
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
      client.connection.send(ProtocolBuilder.moveItem({
        fromSource: 0,
        from: loc,
        toSource: client.containerId,
      }));
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
      client.connection.send(ProtocolBuilder.tame({
        creatureId: creature.id,
      }));
      break;
    case 'throw':
      // TODO
      break;
  }
}

async function createConnection() {
  let connectOverSocket = !window.location.hostname.includes('localhost');
  if (window.location.search.includes('server')) {
    connectOverSocket = true;
  } else if (window.location.search.includes('worker')) {
    connectOverSocket = false;
  }

  if (connectOverSocket) {
    client.connection = await connect(client, 9001);
    // TODO: better 'verbose' / logging (make a logger class).
    console.log('For debugging:\nwindow.Gridia.verbose = true;');
    return;
  }

  const connection = await openAndConnectToServerWorker(client, {
    serverData: '/',
    dummyDelay: 20,
    verbose: false,
  });

  client.connection = connection;
  // @ts-ignore
  window.Gridia.serverWorker = connection._worker;
  // TODO: this doesn't work anymore.
  // console.log('For debugging:\nwindow.Gridia.server.verbose = true;');
}

document.addEventListener('DOMContentLoaded', async () => {
  await createConnection();

  const registerBtn = Helper.find('.register-btn');
  const registerNameEl = Helper.find('#register--name') as HTMLInputElement;

  const parts1 = 'Small Smelly Quick Steely Quiet'.split(' ');
  const parts2 = 'Jill Stranger Arthur Maz Harlet Worker'.split(' ');
  registerNameEl.value = parts1[randInt(0, parts1.length)] + ' ' + parts2[randInt(0, parts2.length)];
  registerBtn.addEventListener('click', () => {
    client.connection.send(ProtocolBuilder.register({
      name: registerNameEl.value,
    }));
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
  client.eventEmitter.on('action', globalOnActionHandler);

  gameSingleton.start();
  // @ts-ignore
  window.Gridia.game = gameSingleton;

  Helper.find('.register').classList.add('hidden');
  Helper.find('.game').classList.remove('hidden');
});
