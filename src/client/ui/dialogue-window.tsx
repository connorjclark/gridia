import { render, h, Component } from 'preact';
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
      return <div>
        <div>
          Dialogue
        </div>
        <div>
          <h1>{state.speaker}</h1>
          <p>{state.text}</p>
          <button onClick={this.onClickNextButton}>Next</button>
        </div>
      </div>;
    }

    onClickNextButton() {
      // TODO: don't do this in ui/
      game.client.connection.sendCommand(CommandBuilder.dialogueResponse({}));
    }
  }

  const el = game.makeUIWindow({ name: 'skills', cell: 'center' });
  render(<DialogueWindow />, el);
  return { el, setState: (s: Partial<State>) => setState(s) };
}
