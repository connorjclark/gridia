import bbCodeParser from 'js-bbcode-parser';
import { render, h, Component } from 'preact';
import { useEffect, useRef, useMemo } from 'preact/hooks';
import Typed from 'typed.js';

import * as CommandBuilder from '../../protocol/command-builder';
import {Game} from '../game';

import { CustomCreatureGraphic, Graphic, makeUIWindow } from './ui-common';

export function makeDialogueWindow(game: Game) {
  let setState = (_: Partial<State>) => {
    // Do nothing.
  };
  interface State {
    dialogue: Exclude<Dialogue, 'onFinish'>;
    index: number;
  }
  class DialogueWindow extends Component {
    // @ts-expect-error
    state: State = {};

    componentDidMount() {
      setState = this.setState.bind(this);
    }

    render(props: any, state: State) {
      const part = useMemo(() => {
        // TODO ...
        if (!this.state.dialogue) return;

        return this.state.dialogue.parts[this.state.index];
      }, [this.state.dialogue, this.state.index]);

      if (!part) return;

      const textEl = useRef(null);
      useEffect(
        () => {
          const string = bbCodeParser.parse(part.text);
          // @ts-expect-error
          const el = textEl.current as string;
          const typed = new Typed(el, {
            strings: [string],
            typeSpeed: 10,
            showCursor: false,
          });
          return () => typed.destroy();
        },
        [part]
      );

      const speakerGfx1 = this.createSpeakerGfx(this.state.dialogue.speakers[0].id);
      const speakerGfx2 = this.createSpeakerGfx(this.state.dialogue.speakers[1].id);

      return <div>
        <div>
          Dialogue
        </div>
        <div>
          <h2 class='flex justify-between'>
            <span class={part.speaker === 0 ? 'active-speaker' : ''}>
              {speakerGfx1}
            </span>
            <span>{this.state.dialogue.speakers[part.speaker].name}</span>
            <span class={part.speaker === 1 ? 'active-speaker' : ''}>
              {speakerGfx2}
            </span>
          </h2>
          <div ref={textEl} class='dialogue__text'></div>
          <button onClick={this.onClickNextButton}>Next</button>
        </div>
      </div>;
    }

    createSpeakerGfx(creatureId: number) {
      const creature = game.client.context.getCreature(creatureId);

      let speakerGfx;
      if (creature.imageData) {
        speakerGfx =
          <CustomCreatureGraphic {...creature.imageData} scale={2}></CustomCreatureGraphic>;
      } else {
        speakerGfx = <Graphic file={creature.graphics.file} index={creature.graphics.index} scale={2}></Graphic>;
      }

      return speakerGfx;
    }

    onClickNextButton() {
      // TODO: don't do this in ui/
      game.client.connection.sendCommand(CommandBuilder.dialogueResponse({}));
    }
  }

  const windowEl = makeUIWindow({ name: 'dialogue', cell: 'center' });
  render(<DialogueWindow />, windowEl);
  return { el: windowEl, setState: (s: Partial<State>) => setState(s) };
}
