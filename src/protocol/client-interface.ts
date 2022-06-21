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

  onSetSector(client: Client, sectorOrOps: Events.SetSector): void {
    const {w, x, y, z} = sectorOrOps;
    if (!('ops' in sectorOrOps)) {
      client.context.map.getPartition(w).sectors[x][y][z] = sectorOrOps.tiles;
      return;
    }

    const sector = client.context.map.getPartition(w).sectors[x][y][z];
    if (!sector) {
      client.connection.sendCommand(CommandBuilder.requestSector({w, x, y, z}));
      return;
    }

    replaySniffedOperations(sector, sectorOrOps.ops);
  }

  onSetContainer(client: Client, containerOrOps: Events.SetContainer): void {
    if (!('ops' in containerOrOps)) {
      client.context.containers.set(containerOrOps.id, containerOrOps);
      return;
    }

    const container = client.context.containers.get(containerOrOps.id);
    if (!container) {
      throw new Error(`not subscribed to container ${containerOrOps.id}`);
    }

    replaySniffedOperations(container, containerOrOps.ops);
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
