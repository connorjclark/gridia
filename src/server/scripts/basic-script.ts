import ClientConnection from '../client-connection';
import { Script } from '../script';
import Server from '../server';
import * as Player from '../../player';

export class BasicScript extends Script {
  captain?: Creature;

  constructor(server: Server) {
    super(server);

    this.addCreatureSpawner({
      descriptors: [{ type: 41 }, { type: 43 }, { type: 98 }],
      limit: 10,
      rate: { seconds: 5 },
      region: { w: 0, x: 25, y: 20, z: 0, width: 25, height: 12 },
    });
  }

  onStart() {
    this.server.registerQuest({
      id: 'TEST_QUEST',
      name: 'Your First Quest',
      stages: [
        'in_room',
        'find_captain',
        'find_kitchen',
        'cook_ribs',
        'collect_meat',
        'cook_meat',
        'return_to_captain',
        'leave_ship',
      ],
    });
  }

  onTick() {
    if (!this.captain || this.captain.dead) {
      this.captain = this.spawnCreature({
        descriptor: {
          type: 11,
          onSpeak: this.onSpeakToCaptain.bind(this),
        },
        loc: { w: 0, x: 25, y: 20, z: 0 },
      });
      if (this.captain) {
        this.captain.name = 'Captain Jack';
        this.captain.canSpeak = true;
      }
    }

    // const region = this.creatureSpawners[0].region;

    // const quest = this.server.getQuest('TEST_QUEST');
    // for (const player of this.server.players.values()) {
    //   console.log(player.name, player.getQuestState(quest)?.stage);
    // }

    // ...
  }

  onPlayerCreated(player: Player, clientConnection: ClientConnection) {
    const loc = { ...this.creatureSpawners[0].region };
    loc.x += 2;
    loc.y += 2;
    clientConnection.player.spawnLoc = loc;
    this.server.moveCreature(clientConnection.creature, loc);

    const quest = this.server.getQuest('TEST_QUEST');
    Player.startQuest(player, quest);
  }

  onPlayerEnterWorld(player: Player) {
    const quest = this.server.getQuest('TEST_QUEST');
    Player.startQuest(player, quest);
  }

  onPlayerKillCreature(player: Player, creature: Creature) {
    if (!this.wasCreatureSpawnedBySpawner(creature)) return;

    const quest = this.server.getQuest('TEST_QUEST');
    Player.advanceQuest(player, quest);
  }

  onSpeakToCaptain(clientConnection: ClientConnection): Dialogue | undefined {
    if (!this.captain) return;

    const quest = this.server.getQuest('TEST_QUEST');
    const state = Player.getQuestState(clientConnection.player, quest);
    if (!state) return;

    const speakers = [clientConnection.creature, this.captain];

    if (state.stage === 'in_room') {
      return {
        speakers,
        parts: [
          { speaker: 1, text: '[i]Welcome[/i]!' },
          { speaker: 0, text: 'Who are you?' },
          { speaker: 1, text: 'The [b]captain[/b]!' },
          { speaker: 0, text: 'Alright.' },
        ],
        onFinish: () => {
          Player.advanceQuest(clientConnection.player, quest);
        },
      };
    } else {
      return {
        speakers,
        parts: [
          { speaker: 1, text: 'Go away.' },
          { speaker: 0, text: 'Alright.' },
        ],
      };
    }
  }
}
