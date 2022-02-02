import {SECTOR_SIZE} from '../../constants.js';
import * as Content from '../../content.js';
import {WorldMapPartition} from '../../world-map-partition.js';
import {Script} from '../script.js';
import {Server} from '../server.js';

interface HubWorldScriptConfig {
  spawner: CreatureSpawner;
}

export class HubWorldScript extends Script<HubWorldScriptConfig> {
  constructor(protected server: Server) {
    super('hub-world', server, 'HubWorldScriptConfig');
  }

  async onStart() {
    async function findWarpPositions(w: number, partition: WorldMapPartition) {
      for (let sx = 0; sx < partition.width / SECTOR_SIZE; sx++) {
        for (let sy = 0; sy < partition.height / SECTOR_SIZE; sy++) {
          await partition.getSectorAsync({x: sx, y: sy, z: 0});
        }
      }

      const warpPositions = [];
      for (let x = 0; x < SECTOR_SIZE; x++) {
        for (let y = 0; y < SECTOR_SIZE; y++) {
          if (partition.getTile({x, y, z: 0}).floor === floor) {
            warpPositions.push({w, x, y, z: 0});
          }
        }
      }

      warpPositions.reverse();
      return warpPositions;
    }

    const floor = 10;
    const [hubWorldW, hubWorldPartition] = this.server.context.map.getPartitionByName('Hub World') || [];
    if (!hubWorldPartition || hubWorldW === undefined) throw new Error('missing Hub World partition');

    const hubWorldWarpPositions = await findWarpPositions(hubWorldW, hubWorldPartition);

    for (const [w, partition] of this.server.context.map.getPartitions()) {
      if (partition === hubWorldPartition) continue;

      const warpFromPos = hubWorldWarpPositions.pop();
      if (!warpFromPos) {
        this.addError('ran out of warp positions');
        break;
      }

      const warpToPos = (await findWarpPositions(w, partition))[0] || {
        w,
        x: Math.floor(partition.width / 2),
        y: Math.floor(partition.height / 2),
        z: 0,
      };

      this.server.setItemInWorld(warpFromPos, {
        type: Content.getMetaItemByName('Warp Portal').id,
        quantity: 1,
        warpTo: warpToPos,
      });
      this.server.setItemInWorld({...warpFromPos, y: warpFromPos.y - 1}, {
        type: Content.getMetaItemByName('Small Sign').id,
        quantity: 1,
        textContent: `Warp to ${partition.name}`,
      });

      await this.server.ensureSectorLoadedForPoint(warpToPos);
      this.server.setFloor(warpToPos, floor);
      this.server.setItemInWorld(warpToPos, {
        type: Content.getMetaItemByName('Warp Portal').id,
        quantity: 1,
        warpTo: {
          w: hubWorldW,
          x: Math.floor(hubWorldPartition.width / 2),
          y: Math.floor(hubWorldPartition.height / 2),
          z: 0,
        },
      });
      await this.server.ensureSectorLoadedForPoint({...warpToPos, y: warpToPos.y - 1});
      this.server.setItemInWorld({...warpToPos, y: warpToPos.y - 1}, {
        type: Content.getMetaItemByName('Small Sign').id,
        quantity: 1,
        textContent: `Warp to ${hubWorldPartition.name}`,
      });
    }

    const creature = this.spawnCreature({
      descriptor: {type: 203, partial: {name: 'Merchant'}},
      pos: {
        w: hubWorldW,
        x: Math.floor(hubWorldPartition.width / 2),
        y: Math.floor(hubWorldPartition.height / 2),
        z: 0,
      },
    });
    if (creature) {
      const container = this.server.context.makeContainer('merchant', 10);
      creature.merchant = {
        containerId: container.id,
      };
      container.items[0] = {type: Content.getMetaItemByName('Mana Plant Seeds').id, quantity: 100_000};
      container.items[1] = {type: Content.getMetaItemByName('Wood Planks').id, quantity: 100_000};
      container.items[2] = {type: Content.getMetaItemByName('Soccer Ball').id, quantity: 100_000};
    }

    this.addCreatureSpawner(this.config.spawner);
  }
}
