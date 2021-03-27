/* eslint-disable max-len */
import { render, h, Component } from 'preact';
import Game from '../game';

export function makeHelpWindow(game: Game) {
  class HelpWindow extends Component {
    render() {
      return <div class="help">
        <a href="https://github.com/connorjclark/gridia-2019-wip" target="_blank">GitHub</a>
        <br></br>WASD to move character.
        <br></br>Number keys / Click to equip tool in inventory.
        <br></br>Arrow keys to select item in the world.
        <br></br>Space to use tool on selected item in the world. Alt to use hand.
        <br></br>To pick up item in the world: shift to pick up selected item, or drag and drop to inventory slot or character.
      </div>;
    }
  }

  const el = game.makeUIWindow({ name: 'help', cell: 'center' });
  render(<HelpWindow />, el);
  return { el };
}
