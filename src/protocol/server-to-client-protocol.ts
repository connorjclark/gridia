import Client from '../client/client';
import Container from '../container';
import * as Content from '../content';
import { equalPoints } from '../utils';
import { ItemSourceWorld } from './client-to-server-protocol';
import * as ProtocolBuilder from './client-to-server-protocol-builder';
import * as Protocol from './gen/server-to-client-protocol';

export default class ServerToClientProtocol implements Protocol.ServerToClientProtocol {
  public onAnimation(client: Client, { key, ...loc }: Protocol.AnimationParams): void {
    const animationData = Content.getAnimation(key);
    if (!animationData) throw new Error('no animation found: ' + key);
    if (client.settings.volume === 0) return;
    for (const frame of animationData.frames) {
      if (frame.sound && client.PIXISound.exists(frame.sound)) {
        client.PIXISound.play(frame.sound, {volume: client.settings.volume});
      }
    }
  }

  public onContainer(client: Client, { ...container }: Protocol.ContainerParams): void {
    client.context.containers.set(container.id, new Container(container.id, container.items));
  }

  public onInitialize(client: Client, { isAdmin, creatureId, containerId, skills }: Protocol.InitializeParams): void {
    client.isAdmin = isAdmin;
    client.creatureId = creatureId;
    client.containerId = containerId;
    for (const [skillId, xp] of skills) {
      client.skills.set(skillId, xp);
    }
  }

  public onInitializePartition(client: Client, { ...pos }: Protocol.InitializePartitionParams): void {
    client.context.map.initPartition(pos.w, pos.x, pos.y, pos.z);
  }

  public onLog(client: Client, { msg }: Protocol.LogParams): void {
    console.log(msg);
  }

  public onRemoveCreature(client: Client, { id }: Protocol.RemoveCreatureParams): void {
    client.context.removeCreature(id);
    }

  public onSector(client: Client, { tiles, ...pos }: Protocol.SectorParams): void {
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

  public onSetCreature(client: Client, { partial, ...partialCreature }: Protocol.SetCreatureParams): void {
    const id = partialCreature.id;

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

    const positionChanged = partialCreature.pos && !equalPoints(creature.pos, partialCreature.pos);
    if (positionChanged) {
      delete client.context.map.getTile(creature.pos).creature;
      client.context.map.getTile(partialCreature.pos).creature = creature;
    }
    Object.assign(creature, partialCreature);
  }

  public onSetFloor(client: Client, { floor, ...loc }: Protocol.SetFloorParams): void {
    client.context.map.getTile(loc).floor = floor;
  }

  public onSetItem(client: Client, { item, source, ...loc }: Protocol.SetItemParams): void {
    if (source === ItemSourceWorld) {
      client.context.map.getTile(loc).item = item;
    } else {
      const container = client.context.containers.get(source);
      if (container) {
        container.items[loc.x] = item;
      }
    }
  }

  public onXp(client: Client, { skill, xp }: Protocol.XpParams): void {
    const currentXp = client.skills.get(skill) || 0;
    client.skills.set(skill, currentXp + xp);
  }
}
