import { render, h, Component } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import bbCodeParser from 'js-bbcode-parser';
import Typed from 'typed.js';
import Game from '../game';
import * as CommandBuilder from '../../protocol/command-builder';

export function makeDialogueWindow(game: Game) {
  let setState = (_: Partial<State>) => {
    // Do nothing.
  };
  interface State {
    speaker: string;
    text: string;
    choices: any[];
  }
  class DialogueWindow extends Component {
    state: State = { speaker: '', text: '', choices: [] };

    componentDidMount() {
      setState = this.setState.bind(this);
    }

    render(props: any, state: State) {
      const textEl = useRef(null);
      useEffect(
        () => {
          const string = bbCodeParser.parse(this.state.text);
          // @ts-expect-error
          const el = textEl.current as string;
          const typed = new Typed(el, {
            strings: [string],
            typeSpeed: 10,
            showCursor: false,
          });
          return () => typed.destroy();
        },
        [this.state.text]
      );

      return <div>
        <div>
          Dialogue
        </div>
        <div>
          <h1>{state.speaker}</h1>
          <div ref={textEl} class='dialogue__text'></div>
          <button onClick={this.onClickNextButton}>Next</button>
        </div>
      </div>;
    }

    onClickNextButton() {
      // TODO: don't do this in ui/
      game.client.connection.sendCommand(CommandBuilder.dialogueResponse({}));
    }
  }

  const windowEl = game.makeUIWindow({ name: 'dialogue', cell: 'center' });
  render(<DialogueWindow />, windowEl);
  return { el: windowEl, setState: (s: Partial<State>) => setState(s) };
}
