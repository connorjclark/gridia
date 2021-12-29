import {PlayerConnection} from '../client-connection.js';
import {Script} from '../script.js';
import {Server} from '../server.js';

export class DogScript extends Script<{}> {
  constructor(protected server: Server) {
    super('dog', server, {});
  }

  onPlayerEnterWorld(player: Player, playerConnection: PlayerConnection) {
    const pos = this.server.findNearestWalkableTile({pos: player.pos, range: 10}) || player.pos;
    const creature = this.server.createCreature({type: 96}, pos);
    if (!creature) return;

    // TODO: make server.tameCreature
    creature.tamedBy = playerConnection.player.id;
    this.server.creatureStates[creature.id].resetGoals();
    this.server.broadcastPartialCreatureUpdate(creature, ['tamedBy']);
  }
}
