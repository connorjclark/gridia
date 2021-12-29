import {PlayerConnection} from '../client-connection.js';
import {Script} from '../script.js';
import {Server} from '../server.js';

export class DogScript extends Script<{}> {
  constructor(protected server: Server) {
    super('dog', server, {});
  }

  onPlayerEnterWorld(player: Player, playerConnection: PlayerConnection) {
    const pos = this.server.findNearest({pos: player.pos, range: 10}, false, (tile, pos2) => {
      // TODO: server.findNearestWalkableTile helper
      return this.server.context.walkable(pos2);
    }) || player.pos;
    this.server.createCreature({type: 96}, pos);
    console.log('dog', pos);
  }
}
