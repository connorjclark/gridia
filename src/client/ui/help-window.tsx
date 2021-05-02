import { render, h, Component } from 'preact';
import { useState } from 'preact/hooks';
import Game from '../game';
import { makeUIWindow } from './ui-common';

const sections: Record<string, string> = {
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
      const [currentSection, setCurrentSection] = useState('General');

      return <div class="help flex">
        <div class="sections">
          {Object.keys(sections).map((name) => {
            const classes = ['section'];
            if (name === currentSection) classes.push('selected');
            return <div class={classes.join(' ')} onClick={() => setCurrentSection(name)}>{name}</div>;
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
