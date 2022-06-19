/* eslint-disable @typescript-eslint/no-unused-vars */

import {Client} from '../client/client.js';
import {replaySniffedOperations} from '../lib/sniff-object.js';

import * as CommandBuilder from './command-builder.js';
import {IEvents} from './gen/client-interface.js';

import Events = Protocol.Events;

export class ClientInterface implements IEvents {
  onAnimation(client: Client, animationInstance: Events.Animation): void {
    // handled by game.ts
  }

  onRawAnimation(client: Client, {pos, tint, path, light, offshootRate, frames}: Events.RawAnimation): void {
    // handled by game.ts
  }

  onContainer(client: Client, {container}: Events.Container): void {
    client.context.containers.set(container.id, container);
  }

  onInitialize(client: Client, opts: Events.Initialize): void {
    client.player = opts.player;
    client.session.creatureId = opts.creatureId;
    // TODO: move to login.
    client.context.secondsPerWorldTick = opts.secondsPerWorldTick;
    client.context.ticksPerWorldDay = opts.ticksPerWorldDay;
  }

  onUpdateSessionState(client: Client, opts: Events.UpdateSessionState): void {
    client.session = {...client.session, ...opts};
  }

  onInitializePartition(client: Client, {name, ...pos}: Events.InitializePartition): void {
    client.context.map.initPartition(name, pos.w, pos.x, pos.y, pos.z);
  }

  onLog(client: Client, {msg}: Events.Log): void {
    console.log(msg);
  }

  onRemoveCreature(client: Client, {id}: Events.RemoveCreature): void {
    client.context.removeCreature(id);
  }

  onSector(client: Client, {tiles, ...pos}: Events.Sector): void {
    client.context.map.getPartition(pos.w).sectors[pos.x][pos.y][pos.z] = tiles;
  }

  onSetCreature(client: Client, creatureOrOps: Events.SetCreature): void {
    if (!creatureOrOps.id) throw new Error('id must exist'); // TODO: can remove?

    if (!('ops' in creatureOrOps)) {
      client.context.setCreature(creatureOrOps);
      return;
    }

    const creature = client.context.getCreature(creatureOrOps.id);
    if (!creature) {
      client.connection.sendCommand(CommandBuilder.requestCreature({id: creatureOrOps.id}));
      return;
    }

    replaySniffedOperations(creature, creatureOrOps.ops);
  }

  onSetPlayer(client: Client, playerOrOps: Events.SetPlayer): void {
    if (!('ops' in playerOrOps)) {
      client.player = playerOrOps;
      return;
    }

    replaySniffedOperations(client.player, playerOrOps.ops);
  }

  onSetFloor(client: Client, {floor, ...pos}: Events.SetFloor): void {
    client.context.map.getTile(pos).floor = floor;
  }

  onSetItem(client: Client, {location, item}: Events.SetItem): void {
    if (location.source === 'world') {
      if (client.context.map.partitions.get(location.pos.w)) {
        client.context.map.getTile(location.pos).item = item;
      }
    } else {
      if (location.index === undefined) throw new Error('invariant violated');

      const container = client.context.containers.get(location.id);
      if (container) {
        container.items[location.index] = item || null;
      }
    }
  }

  onXp(client: Client, {skill, xp}: Events.Xp): void {
    // handled by skills-module.ts
  }

  onChat(client: Client, {section, from, text}: Events.Chat): void {
    // handled by game.ts
  }

  onTime(client: Client, {epoch}: Events.Time): void {
    // handled by game.ts
  }

  onStartDialogue(client: Client, {speakers, dialogue, symbols, index}: Events.StartDialogue): void {
    // handled by game.ts
  }

  onUpdateDialogue(client: Client, {symbols, index}: Events.UpdateDialogue): void {
    // handled by game.ts
  }

  onCreatureStatus(client: Client, {creatureId, text, color}: Events.CreatureStatus): void {
    // handled by game.ts
  }

  onNotification(client: Client, {details}: Events.Notification): void {
    // handled by game.ts
  }
}
