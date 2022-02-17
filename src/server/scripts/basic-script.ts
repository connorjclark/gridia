import {parseDialogueText} from '../../lib/parse-dialogue.js';
import * as Player from '../../player.js';
import {PlayerConnection} from '../client-connection.js';
import {CreatureSpawnerState, Script} from '../script.js';
import {Server} from '../server.js';

// TODO make scripts not use a class.

interface BasicScriptConfig {
  captainRegion: Region;
  monsterSpawnerRegion: Region;
}

interface TestQuestData {
  kills: number;
}

const captainDialogueParts = parseDialogueText(`
1 [i]Welcome[/i]!
0 Who are you?
1 The [b]captain[/b]!
0 Alright.
  - [goto=ask about ship] Is this your ship?
  - [goto=ask about destination] When will we get to Gridia?
  - [goto=ask for axe] Can I have an Axe?
  - [goto=ask about crew, if=X] What's the matter with the crew?

[label=ask about ship]
1 Yep! She's a beut, eh?
0 Meh.
1 ...
0 Sorry, I get too seasick to appreciate a hunk of wood.
1 Well, this hunk of wood is keeping you alive, so show some respect!
[return] 0 Uh, right... ok.

[label=ask about destination, return, symbol=X]
1 We'll get there soon, but right now I'm too busy dealing with the crew
  to give an exact estimate right now.

[label=ask for axe, return, if=Axe]
1 I already gave you one!
[return, if_has_skill=Farming, item=Wood Axe, symbol=Axe]
1 Sure, here you go!
[return]
1 What would you do with that?! [i](You must learn Farming first)[/i]

[label=ask about crew]
1 Glad you asked! Here, time to earn your ticket.
0 Didn't I earn my ticket when I paid you all that gold?
1 Look, just take this sword and kill me some roaches.
[item=Practice Short Sword] 0 Fine.
`);

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
    initialData: {kills: 0},
  };
  monsterSpawnerState?: CreatureSpawnerState;

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
    this.monsterSpawnerState = this.addCreatureSpawner({
      descriptors: [{type: 42}],
      limit: 5,
      rate: {seconds: 5},
      region: this.config.monsterSpawnerRegion,
    });

    this.server.registerQuest(this.quest);
  }

  onPlayerKillCreature(player: Player, creature: Creature) {
    const state = Player.getQuestState(player, this.quest);
    if (!state) return;
    if (!this.monsterSpawnerState?.spawnedCreatures.includes(creature)) return;

    if (!state.data.kills) state.data.kills = 0; // TODO: remove
    state.data.kills += 1;
    Player.advanceQuest(player, this.quest);
    // TODO: quest panel
    console.log(Player.getQuestStatusMessage(player, this.quest));
  }

  onSpeakToCaptain(clientConnection: PlayerConnection, speaker: Creature): Dialogue | undefined {
    const player = clientConnection.player;
    const state = Player.getQuestState(player, this.quest) || Player.startQuest(player, this.quest);
    const speakers = [clientConnection.creature, speaker];

    if (state.stage === 'start') {
      return {
        speakers,
        parts: captainDialogueParts,
        onFinish: () => {
          Player.advanceQuest(player, this.quest);
        },
      };
    } else {
      // return {
      //   speakers,
      //   parts: [
      //     {speaker: 1, text: 'Go away.'},
      //     {speaker: 0, text: 'Alright.'},
      //   ],
      // };
      return {
        speakers,
        parts: captainDialogueParts,
      };
    }
  }
}
