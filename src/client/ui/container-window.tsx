import { render, h, Component } from 'preact';
import * as Content from '../../content';
import Game from '../game';
import Container from '../../container';
import { Graphic } from './ui-common';

export function makeContainerWindow(game: Game, container: Container, name?: string) {
  let setState = (_: State) => {
    // Do nothing.
  };
  interface State {
    name?: string;
    container: Container;
  }
  class ContainerWindow extends Component {
    state: State = { container, name };

    componentDidMount() {
      setState = this.setState.bind(this);
    }

    render(props: any, state: State) {
      return <div>
        <div>
          {state.name || 'Container'}
        </div>
        <div class="container__slots">
          {state.container.items.map((item) => {
            let gfx;
            if (item) {
              const metaItem = Content.getMetaItem(item.type);
              const graphicIndex = metaItem.animations[0];
              gfx = <Graphic
                type={'item'}
                index={graphicIndex}
                quantity={item.quantity}
              ></Graphic>;
            }

            return <div class="container__slot">{gfx}</div>;
          })}
        </div>
      </div>;
    }
  }

  const el = game.makeUIWindow({ name: 'container', cell: 'right' });
  render(<ContainerWindow />, el);
  return { el, setState: (s: State) => setState(s) };
}
