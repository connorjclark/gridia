import {PlayerConnection} from '../client-connection.js';
import {Script} from '../script.js';
import {Server} from '../server.js';

export class DogScript extends Script {
  constructor(protected server: Server) {
    super('dog', server);
  }

  onPlayerEnterWorld(player: Player, playerConnection: PlayerConnection) {
    if (player.tamedCreatureIds.size) return;

    const pos = this.server.findNearestWalkableTile({pos: player.pos, range: 10}) || player.pos;
    const creature = this.server.createCreature({type: 96, partial: {speed: 0}}, pos);
    if (!creature) return;

    this.server.tameCreature(playerConnection.player, creature);
  }
}
