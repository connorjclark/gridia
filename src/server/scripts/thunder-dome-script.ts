import * as Content from '../../content.js';
import {Script} from '../script.js';
import {Server} from '../server.js';

const configDefinition = {
  limit: 'number',
} as const;

export class ThunderDomeScript extends Script<typeof configDefinition> {
  constructor(protected server: Server) {
    super('thunder-dome', server, configDefinition);
  }

  onStart() {
    let [w, partition] = this.server.context.map.getPartitionByName('Thunder Dome') || [];
    if (!partition || w === undefined) {
      w = 0;
      partition = this.server.context.map.getPartition(0);
    }

    this.addCreatureSpawner({
      descriptors: Content.getMonsterTemplates().filter(Boolean).map((m) => ({type: m.id})),
      limit: this.config.limit,
      rate: {seconds: 1},
      region: {
        w,
        x: 0,
        y: 0,
        z: 0,
        width: partition.width,
        height: partition.height,
      },
    });
  }
}
