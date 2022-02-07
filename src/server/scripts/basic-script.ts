import * as Player from '../../player.js';
import {PlayerConnection} from '../client-connection.js';
import {CreatureSpawnerState, Script} from '../script.js';
import {Server} from '../server.js';

// TODO make scripts not use a class.

interface BasicScriptConfig {
  captainRegion: Region;
  ratSpawnerRegion: Region;
}

interface TestQuestData {
  kills: number;
}

export class BasicScript extends Script<BasicScriptConfig> {
  quest: Quest<TestQuestData> = {
    id: 'TEST_QUEST',
    name: 'Your First Quest',
    description: 'Basic quest description',
    stages: [
      'start',
      'find_captain',
      'find_kitchen',
      'cook_ribs',
      'collect_meat',
      'cook_meat',
      'return_to_captain',
      'leave_ship',
      'finish',
    ],
  };
  ratSpawnerState?: CreatureSpawnerState;

  constructor(protected server: Server) {
    super('basic-script', server, 'BasicScriptConfig');
  }

  onStart() {
    this.spawnCreature({
      descriptor: {
        type: 11,
        onSpeak: this.onSpeakToCaptain.bind(this),
        partial: {
          name: 'Captain Jack',
        },
      },
      region: this.config.captainRegion,
    });
    this.ratSpawnerState = this.addCreatureSpawner({
      descriptors: [{type: 41}, {type: 43}, {type: 98}],
      limit: 5,
      rate: {seconds: 5},
      region: this.config.ratSpawnerRegion,
    });

    this.server.registerQuest(this.quest);
  }

  onPlayerKillCreature(player: Player, creature: Creature) {
    const state = Player.getQuestState(player, this.quest);
    if (!state) return;
    if (!this.ratSpawnerState?.spawnedCreatures.includes(creature)) return;

    if (!state.data.kills) state.data.kills = 0; // TODO: remove
    state.data.kills += 1;
    Player.advanceQuest(player, this.quest);
    // TODO: quest panel
    console.log(Player.getQuestStatusMessage(player, this.quest));
  }

  onSpeakToCaptain(clientConnection: PlayerConnection, speaker: Creature): Dialogue | undefined {
    const player = clientConnection.player;
    const state = Player.getQuestState(player, this.quest) || Player.startQuest(player, this.quest, {kills: 0});
    const speakers = [clientConnection.creature, speaker];

    if (state.stage === 'start') {
      return {
        speakers,
        parts: [
          {speaker: 1, text: '[i]Welcome[/i]!'},
          {speaker: 0, text: 'Who are you?'},
          {speaker: 1, text: 'The [b]captain[/b]!'},
          {speaker: 0, text: 'Alright.'},
        ],
        onFinish: () => {
          Player.advanceQuest(player, this.quest);
        },
      };
    } else {
      return {
        speakers,
        parts: [
          {speaker: 1, text: 'Go away.'},
          {speaker: 0, text: 'Alright.'},
        ],
      };
    }
  }
}
