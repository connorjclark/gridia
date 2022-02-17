import bbCodeParser from 'js-bbcode-parser';
import {render, h, Component} from 'preact';
import {useEffect, useRef, useMemo} from 'preact/hooks';
import Typed from 'typed.js';

import * as CommandBuilder from '../../../protocol/command-builder.js';
import {Game} from '../../game.js';
import {CustomCreatureGraphic, Graphic} from '../components/graphic.js';
import {c, ComponentProps, createSubApp} from '../ui-common.js';

interface State {
  speakers: Array<Pick<Creature, 'id'|'name'>>;
  dialogue: Dialogue;
  index: number;
  symbols: string[];
}

export function makeDialogueWindow(game: Game, initialState: State) {
  const actions = {
    setIndex: (state: State, index: number): State => {
      return {
        ...state,
        index,
      };
    },
    setSymbols: (state: State, symbols: string[]): State => {
      return {
        ...state,
        symbols,
      };
    },
  };

  type Props = ComponentProps<State, typeof actions>;
  // TODO: use functions instead of classes
  class DialogueWindow extends Component<Props> {
    render(props: Props) {
      const part = props.dialogue.parts[props.index];
      if (!part) return;

      const textEl = useRef<HTMLDivElement>(null);
      useEffect(
        () => {
          if (!textEl.current) return;

          const string = bbCodeParser.parse(part.text);
          const el = textEl.current;
          const typed = new Typed(el as unknown as string, {
            strings: [string],
            typeSpeed: 10,
            showCursor: false,
          });
          return () => typed.destroy();
        },
        [part, textEl.current]
      );

      const speakerGfx1 = this.createSpeakerGfx(props.speakers[0].id);
      const speakerGfx2 = this.createSpeakerGfx(props.speakers[1].id);

      const onClickNextButton = () => {
        game.client.connection.sendCommand(CommandBuilder.dialogueResponse({}));
      };

      let inputEl;
      if (part.choices) {
        inputEl = <div class="dialogue__choices">
          {part.choices.map((choice, choiceIndex) => {
            if (choice.annotations.if && !props.symbols.includes(choice.annotations.if)) return;

            const onClick = () => {
              game.client.connection.sendCommand(CommandBuilder.dialogueResponse({choiceIndex}));
            };

            return <div class="dialogue__choice" onClick={onClick}>
              <button>{choice.text}</button>
            </div>;
          })}
        </div>;
      } else {
        inputEl = <button onClick={onClickNextButton}>Next</button>;
      }

      return <div>
        <div>
          Dialogue
        </div>
        <div class="m1">
          <div class='flex justify-between'>
            <div class={c(part.speaker === 0 && 'active-speaker')}>
              <span>{props.speakers[0].name}</span>
              {speakerGfx1}
            </div>
            <div class={c(part.speaker === 1 && 'active-speaker')}>
              <span>{props.speakers[1].name}</span>
              {speakerGfx2}
            </div>
          </div>
          <div ref={textEl} class={`dialogue__text dialouge__text--speaker-${part.speaker}`}></div>
          {inputEl}
        </div>
      </div>;
    }

    createSpeakerGfx(creatureId: number) {
      const creature = game.client.context.getCreature(creatureId);

      let speakerGfx;
      if (creature.equipmentGraphics) {
        speakerGfx =
          <CustomCreatureGraphic graphics={creature.equipmentGraphics} scale={2}></CustomCreatureGraphic>;
      } else {
        // TODO: just pass the entire graphic object, allow for animation.
        speakerGfx = <Graphic file={creature.graphics.file} index={creature.graphics.frames[0]} scale={2}></Graphic>;
      }

      return speakerGfx;
    }
  }

  const {SubApp, exportedActions, subscribe} = createSubApp(DialogueWindow, initialState, actions);
  const delegate = game.windowManager.createWindow({
    id: 'dialogue',
    cell: 'center',
    onInit(el) {
      render(<SubApp />, el);
    },
  });

  return {delegate, actions: exportedActions, subscribe};
}
