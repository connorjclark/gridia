import * as Content from '../../content.js';
import {game, makeGame} from '../../game-singleton.js';
import * as CommandBuilder from '../../protocol/command-builder.js';
import * as Utils from '../../utils.js';
import {Client} from '../client.js';
import {GameActionEvent} from '../event-emitter.js';
import * as Helper from '../helper.js';

import {SceneController} from './scene-controller.js';
import {Scene} from './scene.js';

function globalActionCreator(location: ItemLocation): GameAction[] {
  let item;
  let creature;
  if (location.source === 'world') {
    const tile = game.client.context.map.getTile(location.loc);
    item = tile.item;
    creature = game.client.context.getCreatureAt(location.loc);
  } else {
    const container = game.client.context.containers.get(location.id);
    if (!container || location.index === undefined) return [];

    item = container.items[location.index];
  }

  const isInInventory = item && location.source === 'container' && location.id === game.client.player.containerId;

  const meta = Content.getMetaItem(item ? item.type : 0);
  const actions: GameAction[] = [];

  if (creature) {
    if (creature.canSpeak) {
      actions.push({
        type: 'speak',
        innerText: 'Speak',
        title: 'Speak',
      });
    }

    if (!creature.isPlayer) {
      actions.push({
        type: 'attack',
        innerText: 'Attack [R]',
        title: 'Attack',
      });
    }

    if (!creature.tamedBy && !creature.isPlayer) {
      actions.push({
        type: 'tame',
        innerText: 'Tame',
        title: 'Tame',
      });
    }

    return actions;
  }

  if (item && meta.moveable) {
    if (location.source === 'world') {
      actions.push({
        type: 'pickup',
        innerText: 'Pickup',
        title: 'Shortcut: Shift',
      });
    } else if (!isInInventory) {
      actions.push({
        type: 'pickup',
        innerText: 'Take',
        title: '',
      });
    }
  }

  if (item && meta.equipSlot && isInInventory) {
    actions.push({
      type: 'equip',
      innerText: 'Equip',
      title: '',
    });
  }

  if (item && meta.moveable && meta.stackable && item.quantity > 1) {
    actions.push({
      type: 'split',
      innerText: 'Split',
      title: '',
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

  // Create an action for every applicable item in inventory that could be used as a tool.
  const inventory = Helper.getInventory();
  for (const [index, tool] of Object.entries(inventory.items)) {
    if (!tool) continue;

    if (Helper.usageExists(tool.type, meta.id)) {
      actions.push({
        type: 'use-tool',
        innerText: `Use ${Content.getMetaItem(tool.type).name}`,
        title: Number(index) === Helper.getSelectedToolIndex() ? 'Shortcut: Spacebar' : '',
        extra: {
          index: Number(index),
        },
      });
    }
  }

  return actions;
}

function globalOnActionHandler(client: Client, e: GameActionEvent) {
  const type = e.action.type;
  const {creature, location, quantity} = e;

  switch (type) {
  case 'pickup':
    client.connection.sendCommand(CommandBuilder.moveItem({
      from: location,
      to: Utils.ItemLocation.Container(client.player.containerId),
    }));
    break;
  case 'equip':
    client.connection.sendCommand(CommandBuilder.moveItem({
      from: location,
      to: Utils.ItemLocation.Container(client.player.equipmentContainerId),
    }));
    break;
  case 'split':
    client.connection.sendCommand(CommandBuilder.moveItem({
      from: location,
      quantity: quantity || 1,
      to: Utils.ItemLocation.Container(client.player.containerId),
    }));
    break;
  case 'use-hand':
    if (location.source === 'world') Helper.useHand(location.loc);
    break;
  case 'use-tool':
    if (location.source === 'world') Helper.useTool(location.loc, {toolIndex: e.action.extra.index});
    break;
  case 'open-container':
    if (location.source === 'world') Helper.openContainer(location.loc);
    break;
  case 'attack':
  case 'tame':
  case 'speak':
    client.connection.sendCommand(CommandBuilder.creatureAction({
      creatureId: creature.id,
      type,
    }));
    break;
  case 'throw':
    // TODO
    break;
  }
}

export class GameScene extends Scene {
  constructor(private controller: SceneController) {
    super(Helper.find('.game'));
  }

  onShow() {
    super.onShow();

    const client = this.controller.client;
    const gameSingleton = makeGame(client);
    gameSingleton.addActionCreator(globalActionCreator);
    client.eventEmitter.on('action', globalOnActionHandler.bind(globalOnActionHandler, client));
    gameSingleton.start();

    // Once in game, too complicated to go back. For now, must refresh the page.
    Helper.find('.scene-controller').classList.add('hidden');

    // @ts-expect-error
    window.Gridia.game = gameSingleton;
  }
}
