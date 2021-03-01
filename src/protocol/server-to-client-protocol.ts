/* eslint-disable @typescript-eslint/no-unused-vars */

import Client from '../client/client';
import Container from '../container';
import * as Utils from '../utils';
import * as ProtocolBuilder from './client-to-server-protocol-builder';
import IServerToClientProtocol from './gen/server-to-client-protocol';
import Params = ServerToClientProtocol.Params;

export default class ServerToClientProtocol implements IServerToClientProtocol {
  onAnimation(client: Client, { key, ...loc }: Params.Animation): void {
    // handled by game.ts
  }

  onContainer(client: Client, { ...container }: Params.Container): void {
    client.context.containers.set(container.id, new Container(container.type, container.id, container.items));
  }

  onInitialize(client: Client, { player, secondsPerWorldTick, ticksPerWorldDay }: Params.Initialize): void {
    client.player = player;
    client.secondsPerWorldTick = secondsPerWorldTick;
    client.ticksPerWorldDay = ticksPerWorldDay;
  }

  onInitializePartition(client: Client, { ...pos }: Params.InitializePartition): void {
    client.context.map.initPartition(pos.w, pos.x, pos.y, pos.z);
  }

  onLog(client: Client, { msg }: Params.Log): void {
    console.log(msg);
  }

  onRemoveCreature(client: Client, { id }: Params.RemoveCreature): void {
    client.context.removeCreature(id);
  }

  onSector(client: Client, { tiles, ...pos }: Params.Sector): void {
    client.context.map.getPartition(pos.w).sectors[pos.x][pos.y][pos.z] = tiles;

    // Request creature if not in client memory.
    for (const row of tiles) {
      for (const tile of row) {
        if (tile.creature) {
          if (!client.context.getCreature(tile.creature.id)) {
            client.connection.send(ProtocolBuilder.requestCreature({ id: tile.creature.id }));
          }
          // TODO rethink what's going on here.
          tile.creature = undefined;
        }
      }
    }
  }

  onSetCreature(client: Client, { partial, ...partialCreature }: Params.SetCreature): void {
    const id = partialCreature.id;
    // TODO: fix in types?
    if (!id) throw new Error('id must exist');

    const creature = client.context.getCreature(id);
    if (!creature) {
      if (partial) {
        client.connection.send(ProtocolBuilder.requestCreature({ id }));
      } else {
        // @ts-ignore - it's not a partial creature.
        client.context.setCreature(partialCreature);
      }
      return;
    }

    // Check if position changed.
    if (partialCreature.pos && !Utils.equalPoints(creature.pos, partialCreature.pos)) {
      client.context.map.moveCreature(creature, partialCreature.pos);
    }
    Object.assign(creature, partialCreature);
  }

  onSetFloor(client: Client, { floor, ...loc }: Params.SetFloor): void {
    client.context.map.getTile(loc).floor = floor;
  }

  onSetItem(client: Client, { location, item }: Params.SetItem): void {
    if (location.source === 'world') {
      client.context.map.getTile(location.loc).item = item;
    } else {
      if (location.index === undefined) throw new Error('invariant violated');

      const container = client.context.containers.get(location.id);
      if (container) {
        container.items[location.index] = item || null;
      }
    }
  }

  onXp(client: Client, { skill, xp }: Params.Xp): void {
    const currentXp = client.player.skills.get(skill) || 0;
    client.player.skills.set(skill, currentXp + xp);
  }

  onChat(client: Client, { from, to, message }: Params.Chat): void {
    // handled by game.ts
  }

  onTime(client: Client, { epoch }: Params.Time): void {
    // handled by game.ts
  }
}
