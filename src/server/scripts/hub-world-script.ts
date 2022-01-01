import {SECTOR_SIZE} from '../../constants.js';
import * as Content from '../../content.js';
import {Script} from '../script.js';
import {Server} from '../server.js';

export class HubWorldScript extends Script<{}> {
  constructor(protected server: Server) {
    super('hub-world', server, {});
  }

  async onStart() {
    const floor = 10;
    const [hubWorldW, hubWorldPartition] = this.server.context.map.getPartitionByName('Hub World') || [];
    if (!hubWorldPartition || hubWorldW === undefined) throw new Error('missing Hub World partition');

    await hubWorldPartition.getSectorAsync({x: 0, y: 0, z: 0});

    const warpPositions = [];
    for (let x = 0; x < SECTOR_SIZE; x++) {
      for (let y = 0; y < SECTOR_SIZE; y++) {
        if (hubWorldPartition.getTile({x, y, z: 0}).floor === floor) {
          warpPositions.push({w: hubWorldW, x, y, z: 0});
        }
      }
    }
    warpPositions.reverse();

    for (const [w, partition] of this.server.context.map.getPartitions()) {
      if (partition === hubWorldPartition) continue;

      const warpFromPos = warpPositions.pop();
      if (!warpFromPos) throw new Error('ran out of warp positions');

      const warpToPos = {
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
  }
}
