import { render, h, Component } from 'preact';
import Game from '../game';
import { makeUIWindow } from './ui-common';

const sections = {
  'General': `
    <a href="https://github.com/connorjclark/gridia-2019-wip" target="_blank">GitHub</a>
    <br>WASD to move character.
    <br>Number keys / Click to equip tool in inventory.
    <br>Arrow keys to select item in the world.
    <br>Space to use tool on selected item in the world. Alt to use hand.
    <br>To pick up item in the world: shift to pick up selected item, or drag and drop to inventory slot or character.
  `,
  'Attributes, Skills and Leveling Up': `
    Lorem Ipsum ...
  `,
  'Crafting': `
    Lorem Ipsum ...
  `,
  'Combat': `
    Lorem Ipsum ...
  `,
  'Chat': `
    Lorem Ipsum ...
  `,
  'Land Ownership': `
    Coming Soon
  `,
};

export function makeHelpWindow(game: Game) {
  class HelpWindow extends Component {
    render() {

      const currentSection = 'General';
      return <div class="help">
        <div class="sections">
          {Object.keys(sections).map((name) => {
            return <div>{name}</div>;
          })}
        </div>

        <div class="current-section">
          <div dangerouslySetInnerHTML={{ __html: sections[currentSection] }}></div>
        </div>
      </div>;
    }
  }

  const el = makeUIWindow({ name: 'help', cell: 'center' });
  render(<HelpWindow />, el);
  return { el };
}
