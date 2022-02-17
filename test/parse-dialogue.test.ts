/* eslint-disable max-len */

import expect from 'expect';

import {parseDialogueText} from '../src/lib/parse-dialogue.js';

describe('parseDialogueText', () => {
  it('basics', () => {
    const dialogue = parseDialogueText(`
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

    // console.log(JSON.stringify(dialogue, null, 2));
    // TODO: use snapshot
    expect(dialogue).toStrictEqual([
      {
        speaker: 1,
        text: '[i]Welcome[/i]!',
      },
      {
        speaker: 0,
        text: 'Who are you?',
      },
      {
        speaker: 1,
        text: 'The [b]captain[/b]!',
      },
      {
        speaker: 0,
        text: 'Alright.',
        choices: [
          {
            annotations: {
              goto: '4',
            },
            text: 'Is this your ship?',
          },
          {
            annotations: {
              goto: '10',
            },
            text: 'When will we get to Gridia?',
          },
          {
            annotations: {
              goto: '11',
            },
            text: 'Can I have an Axe?',
          },
          {
            annotations: {
              goto: '14',
              if: 'X',
            },
            text: 'What\'s the matter with the crew?',
          },
        ],
      },
      {
        speaker: 1,
        text: 'Yep! She\'s a beut, eh?',
      },
      {
        speaker: 0,
        text: 'Meh.',
      },
      {
        speaker: 1,
        text: '...',
      },
      {
        speaker: 0,
        text: 'Sorry, I get too seasick to appreciate a hunk of wood.',
      },
      {
        speaker: 1,
        text: 'Well, this hunk of wood is keeping you alive, so show some respect!',
      },
      {
        speaker: 0,
        text: 'Uh, right... ok.',
        annotations: {
          return: '',
        },
      },
      {
        speaker: 1,
        text: 'We\'ll get there soon, but right now I\'m too busy dealing with the crew to give an exact estimate right now.',
        annotations: {
          return: '',
          symbol: 'X',
        },
      },
      {
        speaker: 1,
        text: 'I already gave you one!',
        annotations: {
          return: '',
          if: 'Axe',
        },
      },
      {
        speaker: 1,
        text: 'Sure, here you go!',
        annotations: {
          return: '',
          if_has_skill: 'Farming',
          item: 'Wood Axe',
          symbol: 'Axe',
        },
      },
      {
        speaker: 1,
        text: 'What would you do with that?! [i](You must learn Farming first)[/i]',
        annotations: {
          return: '',
        },
      },
      {
        speaker: 1,
        text: 'Glad you asked! Here, time to earn your ticket.',
      },
      {
        speaker: 0,
        text: 'Didn\'t I earn my ticket when I paid you all that gold?',
      },
      {
        speaker: 1,
        text: 'Look, just take this sword and kill me some roaches.',
      },
      {
        speaker: 0,
        text: 'Fine.',
        annotations: {
          item: 'Practice Short Sword',
        },
      },
    ]);
  });
});
