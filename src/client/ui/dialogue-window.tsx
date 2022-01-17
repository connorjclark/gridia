import bbCodeParser from 'js-bbcode-parser';
import {render, h, Component} from 'preact';
import {useEffect, useRef, useMemo} from 'preact/hooks';
import Typed from 'typed.js';

import * as CommandBuilder from '../../protocol/command-builder.js';
import {Game} from '../game.js';

import {ComponentProps, createSubApp, CustomCreatureGraphic, Graphic} from './ui-common.js';

interface State {
  dialogue: Exclude<Dialogue, 'onFinish'>;
  index: number;
}

export function makeDialogueWindow(game: Game) {
  const actions = () => ({
    setState: (state: State, newState: State): State => {
      return {
        ...newState,
      };
    },
  });

  type Props = ComponentProps<State, typeof actions>;
  // TODO: use functions instead of classes
  class DialogueWindow extends Component<Props> {
    render(props: any) {
      const part = useMemo(() => {
        // TODO ...
        if (!props.dialogue) return;

        return props.dialogue.parts[props.index];
      }, [props.dialogue, props.index]);

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

      const speakerGfx1 = this.createSpeakerGfx(props.dialogue.speakers[0].id);
      const speakerGfx2 = this.createSpeakerGfx(props.dialogue.speakers[1].id);

      return <div>
        <div>
          Dialogue
        </div>
        <div>
          <h2 class='flex justify-between'>
            <span class={part.speaker === 0 ? 'active-speaker' : ''}>
              {speakerGfx1}
            </span>
            <span>{props.dialogue.speakers[part.speaker].name}</span>
            <span class={part.speaker === 1 ? 'active-speaker' : ''}>
              {speakerGfx2}
            </span>
          </h2>
          <div ref={textEl} class={`dialogue__text dialouge__text--speaker-${part.speaker}`}></div>
          <button onClick={this.onClickNextButton}>Next</button>
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

    onClickNextButton() {
      // TODO: don't do this in ui/
      game.client.connection.sendCommand(CommandBuilder.dialogueResponse({}));
    }
  }

  const {SubApp, exportedActions, subscribe} = createSubApp(DialogueWindow, {}, actions);
  const delegate = game.windowManager.createWindow({
    id: 'dialogue',
    cell: 'center',
    onInit(el) {
      render(<SubApp />, el);
    },
  });

  return {delegate, actions: exportedActions, subscribe};
}
