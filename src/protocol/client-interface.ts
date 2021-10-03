/* eslint-disable @typescript-eslint/no-unused-vars */

import {Client} from '../client/client.js';
import * as Content from '../content.js';
import * as Player from '../player.js';

import * as CommandBuilder from './command-builder.js';
import {IEvents} from './gen/client-interface.js';

import Events = Protocol.Events;

export class ClientInterface implements IEvents {
  onAnimation(client: Client, animationInstance: Events.Animation): void {
    // handled by game.ts
  }

  onContainer(client: Client, {container}: Events.Container): void {
    client.context.containers.set(container.id, container);
  }

  onInitialize(client: Client, opts: Events.Initialize): void {
    client.player = opts.player;
    client.creatureId = opts.creatureId;
    client.secondsPerWorldTick = opts.secondsPerWorldTick;
    client.ticksPerWorldDay = opts.ticksPerWorldDay;
  }

  onInitializePartition(client: Client, {...pos}: Events.InitializePartition): void {
    client.context.map.initPartition(pos.w, pos.x, pos.y, pos.z);
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

  onSetCreature(client: Client, {partial, ...partialCreature}: Events.SetCreature): void {
    const id = partialCreature.id;
    // TODO: fix in types?
    if (!id) throw new Error('id must exist');

    const creature = client.context.getCreature(id);
    if (!creature) {
      if (partial) {
        client.connection.sendCommand(CommandBuilder.requestCreature({id}));
      } else {
        // @ts-ignore - it's not a partial creature.
        client.context.setCreature(partialCreature);
      }
      return;
    }

    Object.assign(creature, partialCreature);
  }

  onSetFloor(client: Client, {floor, ...loc}: Events.SetFloor): void {
    client.context.map.getTile(loc).floor = floor;
  }

  onSetItem(client: Client, {location, item}: Events.SetItem): void {
    if (location.source === 'world') {
      if (client.context.map.partitions.get(location.loc.w)) {
        client.context.map.getTile(location.loc).item = item;
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
    Player.incrementSkillXp(client.player, skill, xp);
  }

  onChat(client: Client, {section, from, text}: Events.Chat): void {
    // handled by game.ts
  }

  onTime(client: Client, {epoch}: Events.Time): void {
    // handled by game.ts
  }

  onDialogue(client: Client, {dialogue, index}: Events.Dialogue): void {
    // handled by game.ts
  }

  onSetAttackTarget(client: Client, {creatureId}: Events.SetAttackTarget): void {
    client.attackingCreatureId = creatureId;
  }
}
