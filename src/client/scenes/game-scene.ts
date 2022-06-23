import * as Content from '../../content.js';
import {game, makeGame} from '../../game-singleton.js';
import * as CommandBuilder from '../../protocol/command-builder.js';
import * as Utils from '../../utils.js';
import {GameActionEvent} from '../event-emitter.js';
import * as Helper from '../helper.js';

import {SceneController} from './scene-controller.js';
import {Scene} from './scene.js';

function globalActionCreator(location: ItemLocation): GameAction[] {
  let item;
  let creature;
  if (location.source === 'world') {
    const tile = game.client.context.map.getTile(location.pos);
    item = tile.item;
    creature = game.client.context.getCreatureAt(location.pos);
  } else {
    const container = game.client.context.containers.get(location.id);
    if (!container || location.index === undefined) return [];

    item = container.items[location.index];
  }

  const isInInventory = item && location.source === 'container' && location.id === game.client.player.containerId;

  const meta = Content.getMetaItem(item ? item.type : 0);
  const actions: GameAction[] = [];

  if (creature) {
    if (creature.merchant) {
      actions.push({
        type: 'trade',
        innerText: 'Trade',
        title: 'Trade',
      });
      return actions;
    }

    if (creature.canSpeak) {
      actions.push({
        type: 'speak',
        innerText: 'Speak',
        title: 'Speak',
      });
    }

    if (!creature.isPlayer && !creature.isNPC) {
      actions.push({
        type: 'attack',
        innerText: game.client.session.attackingCreatureId ? 'Stop Attack [R]' : 'Attack [R]',
        title: 'Attack',
      });
    }

    if (!creature.tamedBy && !creature.isPlayer && creature.tameable && !creature.isNPC) {
      actions.push({
        type: 'tame',
        innerText: 'Tame',
        title: 'Tame',
      });
    }

    return actions;
  }

  if (item && meta.class === 'Food') {
    actions.push({
      type: 'eat',
      innerText: 'Eat',
      title: '',
    });
  }

  if (item && meta.readable) {
    actions.push({
      type: 'read',
      innerText: 'Read',
      title: '',
    });
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
    } else if (game.getOpenContainerId()) {
      actions.push({
        type: 'put-away',
        innerText: 'Put Away',
        title: '',
        extra: {
          containerId: game.getOpenContainerId(),
        },
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

// TODO: make this match an action on the protocol:
// type, location, to?
function globalOnActionHandler(e: GameActionEvent) {
  const client = game.client;

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
  case 'put-away':
    client.connection.sendCommand(CommandBuilder.moveItem({
      from: location,
      to: Utils.ItemLocation.Container(e.action.extra.containerId),
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
    if (location.source === 'world') Helper.useHand(location.pos);
    break;
  case 'use-tool':
    if (location.source === 'world') Helper.useTool(location.pos, {toolIndex: e.action.extra.index});
    break;
  case 'open-container':
    if (location.source === 'world') Helper.openContainer(location.pos);
    break;
  case 'attack':
  case 'tame':
  case 'speak':
  case 'trade':
    client.connection.sendCommand(CommandBuilder.creatureAction({
      creatureId: creature.id,
      type,
    }));
    break;
  case 'throw':
    game.enterClickTileMode({
      onClickTile: (selectedLocation) => {
        client.connection.sendCommand(CommandBuilder.itemAction({
          type: 'throw',
          from: location,
          to: selectedLocation,
        }));
        return {finished: true};
      },
      itemCursor: location.source === 'world' ?
        client.context.map.getItem(location.pos) :
        client.context.containers.get(location.id)?.items[location.index || 0],
    });
    break;
  case 'read':
    client.connection.sendCommand(CommandBuilder.readItem({
      location,
    })).then((response) => {
      game.addToChat('World', response.content);
    });
    break;
  case 'eat':
    client.connection.sendCommand(CommandBuilder.eatItem({
      location,
    }));
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
    client.eventEmitter.on('action', globalOnActionHandler);
    gameSingleton.start();

    // Once in game, too complicated to go back. For now, must refresh the page.
    Helper.find('.scene-controller').classList.add('hidden');

    // @ts-expect-error
    window.Gridia.game = gameSingleton;

    this.controller.requestFullscreen();
  }
}
