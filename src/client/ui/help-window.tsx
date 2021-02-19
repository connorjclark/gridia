import { render, h, Component } from 'preact';
import Game from '../game';

export function makeHelpWindow(game: Game) {
  class HelpWindow extends Component {
    render() {
      return <div class="help">
        <a href="https://github.com/connorjclark/gridia-2019-wip">GitHub</a>
        <pre>
          WASD to move character.
          Number keys / Click to equip tool in inventory.
          Arrow keys to select item in the world.
          Space to use tool on selected item in the world. Alt to use hand.
          To pick up item in the world: shift to pick up selected item, or drag and drop to inventory slot or character.
        </pre>
      </div>;
    }
  }

  const el = game.makeUIWindow('center');
  el.classList.add('ui-help');
  render(<HelpWindow />, el);
  return { el };
}
