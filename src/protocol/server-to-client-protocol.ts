import PIXISound from 'pixi-sound';
import Client from '../client/client';
import Container from '../container';
import * as Content from '../content';
import { game } from '../game-singleton';
import * as Utils from '../utils';
import { ItemSourceWorld } from './client-to-server-protocol';
import * as ProtocolBuilder from './client-to-server-protocol-builder';
import IServerToClientProtocol from './gen/server-to-client-protocol';
import Params = ServerToClientProtocol.Params;

export default class ServerToClientProtocol implements IServerToClientProtocol {
  public onAnimation(client: Client, { key, ...loc }: Params.Animation): void {
    // handled by game.ts
  }

  public onContainer(client: Client, { ...container }: Params.Container): void {
    client.context.containers.set(container.id, new Container(container.id, container.items));
  }

  public onInitialize(client: Client, { isAdmin, creatureId, containerId, skills }: Params.Initialize): void {
    client.isAdmin = isAdmin;
    client.creatureId = creatureId;
    client.containerId = containerId;
    for (const [skillId, xp] of skills) {
      client.skills.set(skillId, xp);
    }
  }

  public onInitializePartition(client: Client, { ...pos }: Params.InitializePartition): void {
    client.context.map.initPartition(pos.w, pos.x, pos.y, pos.z);
  }

  public onLog(client: Client, { msg }: Params.Log): void {
    console.log(msg);
  }

  public onRemoveCreature(client: Client, { id }: Params.RemoveCreature): void {
    client.context.removeCreature(id);
  }

  public onSector(client: Client, { tiles, ...pos }: Params.Sector): void {
    client.context.map.getPartition(pos.w).sectors[pos.x][pos.y][pos.z] = tiles;

    for (const row of tiles) {
      for (const tile of row) {
        if (tile.creature) {
          // Do not re-register creature.
          // TODO: Remove this line creates an issue when player warps to a different sector.
          if (client.context.getCreature(tile.creature.id)) continue;

          client.context.setCreature(tile.creature);
        }
      }
    }
  }

  public onSetCreature(client: Client, { partial, ...partialCreature }: Params.SetCreature): void {
    const id = partialCreature.id;
    // TODO: fix in types?
    if (!id) throw new Error('id must exist');

    const creature = client.context.getCreature(id);
    if (!creature) {
      if (partial) {
        client.connection.send(ProtocolBuilder.requestCreature({id}));
      } else {
        // @ts-ignore - it's not a partial creature.
        client.context.setCreature(partialCreature);
      }
      return;
    }

    // Check if position changed.
    if (partialCreature.pos && !Utils.equalPoints(creature.pos, partialCreature.pos)) {
      delete client.context.map.getTile(creature.pos).creature;
      client.context.map.getTile(partialCreature.pos).creature = creature;
    }
    Object.assign(creature, partialCreature);
  }

  public onSetFloor(client: Client, { floor, ...loc }: Params.SetFloor): void {
    client.context.map.getTile(loc).floor = floor;
  }

  public onSetItem(client: Client, { item, source, ...loc }: Params.SetItem): void {
    if (source === ItemSourceWorld) {
      client.context.map.getTile(loc).item = item;
    } else {
      const container = client.context.containers.get(source);
      if (container) {
        container.items[loc.x] = item || null;
      }
    }
  }

  public onXp(client: Client, { skill, xp }: Params.Xp): void {
    const currentXp = client.skills.get(skill) || 0;
    client.skills.set(skill, currentXp + xp);
  }
}
