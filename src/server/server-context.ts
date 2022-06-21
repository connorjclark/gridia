import {Context} from '../context.js';
import {Database} from '../database.js';
import {sniffObject} from '../lib/sniff-object.js';
import * as Utils from '../utils.js';
import {WorldMap} from '../world-map.js';

import {ClientConnection} from './client-connection.js';
import * as Load from './load-data.js';
import {Server} from './server.js';

export class ServerContext extends Context {
  clientConnections: ClientConnection[] = [];
  players = new Map<string, Player>();
  playerNamesToIds = new Map<string, string>();
  claims: Record<string, string> = {};
  nextCreatureId = 1;
  scriptConfigStore: Record<string, any> = {};
  // TODO remove
  server: Server | undefined;

  constructor(worldDataDefinition: WorldDataDefinition, map: WorldMap, public db: Database) {
    super(worldDataDefinition, map);
  }

  makeContainer(type: Container['type'], size = 30) {
    const container = this.sniffContainer({
      id: Utils.uuid(),
      type,
      items: Array(size).fill(null),
    });
    this.containers.set(container.id, container);
    return container;
  }

  getContainerIdFromItem(item: Item) {
    if (!item.containerId) {
      item.containerId = this.makeContainer('normal', 10).id;
    }

    return item.containerId;
  }

  // TODO defer to loader like sector is?
  async getContainer(id: string): Promise<Container> {
    const cachedContainer = this.containers.get(id);
    if (cachedContainer) return cachedContainer;

    const container = this.sniffContainer(await Load.loadContainer(this, id));
    this.containers.set(id, container);
    return container;
  }

  async getPlayer(id: string) {
    return this.players.get(id) || await Load.loadPlayer(this, id);
  }

  async save() {
    await Load.saveServerContext(this);
  }

  private sniffContainer(container: Container) {
    return sniffObject(container, (op) => {
      if (!this.server) throw new Error('missing this.server');

      const ops = this.server.pendingContainerSniffedOperations.get(container) || [];
      ops.push(op);
      this.server.pendingContainerSniffedOperations.set(container, ops);
    });
  }
}
