import { render, h, Component } from 'preact';
import * as Utils from '../../utils';
import * as Content from '../../content';
import Game from '../game';
import Container, { ContainerType } from '../../container';
import { Graphic, ComponentProps, createSubApp, makeUIWindow } from './ui-common';

interface State {
  name?: string;
  container: Pick<Container, 'id' | 'items'>;
  selectedIndex: number | null;
}

export function makeContainerWindow(game: Game, container: Container, name?: string) {
  const initialState: State = {
    name,
    container,
    selectedIndex: null,
  };

  const actions = () => ({
    setContainer: (state: State, container_: Container): State => {
      return { ...state, container: { ...container_ } };
    },
    setSelectedIndex: (state: State, selectedIndex: number | null): State => {
      if (selectedIndex === state.selectedIndex) selectedIndex = null;

      // lol
      game.state.containers[state.container.id] = game.state.containers[state.container.id] || {};
      game.state.containers[state.container.id].selectedIndex = selectedIndex;

      // Selected item actions are based off currently selected tool. Fire
      // an event so the appropriate system can respond to changes.
      game.client.eventEmitter.emit('containerWindowSelectedIndexChanged');

      return { ...state, selectedIndex };
    },
  });

  type Props = ComponentProps<State, typeof actions>;
  class ContainerWindow extends Component<Props> {
    render(props: Props) {
      return <div>
        <div>
          {props.name || 'Container'}
        </div>
        <div class="container__slots">
          {props.container.items.map((item, i) => {
            let gfx;
            if (item) {
              const metaItem = Content.getMetaItem(item.type);
              const graphicIndex = metaItem.animations ? (metaItem.animations[0] || 0) : 0;
              gfx = <Graphic
                type={'items'}
                index={graphicIndex}
                quantity={item.quantity}
              ></Graphic>;
            }

            const classes = ['container__slot'];
            if (props.selectedIndex === i) classes.push('container__slot--selected');

            return <div class={classes.join(' ')} data-index={i}>{gfx}</div>;
          })}
        </div>
      </div>;
    }
  }

  const { SubApp, exportedActions, subscribe } = createSubApp(ContainerWindow, initialState, actions);
  const el = makeUIWindow({ name: 'container', cell: 'right', noscroll: true });
  render(<SubApp />, el);

  if (container.type === ContainerType.Equipment) {
    el.classList.add('window--equipment');
  }

  let mouseDownIndex: number;
  let mouseOverIndex: number;

  const getIndex = (e: PointerEvent): number | undefined => {
    const target = e.target as HTMLElement;
    const slotEl = target.closest('.container__slot') as HTMLElement;
    if (!slotEl) return;

    const index = Number(slotEl.dataset.index);
    return index;
  };

  el.addEventListener('pointerdown', (e) => {
    // lol
    // @ts-expect-error
    container = game.client.context.containers.get(container.id);

    const index = getIndex(e);
    if (index === undefined || !container.items[index]) return;

    mouseDownIndex = index;

    game.client.eventEmitter.emit('itemMoveBegin', {
      location: Utils.ItemLocation.Container(container.id, index),
      item: container.items[index] || undefined,
    });
  });

  el.addEventListener('pointermove', (e) => {
    const index = getIndex(e);
    if (index === undefined) return;

    mouseOverIndex = index;
    // TODO: show selected view temporarily when hovering.
    // game.modules.selectedView.selectView(Utils.ItemLocation.Container(container.id, index));
  });

  // el.addEventListener('pointerout', () => {
  //   if (game.state.selectedView.location?.source === 'container') {
  //     game.modules.selectedView.clearSelectedView();
  //   }
  // });

  el.addEventListener('pointerup', () => {
    if (mouseOverIndex !== undefined) {
      game.client.eventEmitter.emit('itemMoveEnd', {
        location: Utils.ItemLocation.Container(container.id, mouseOverIndex),
      });
    }
    if (mouseDownIndex === mouseOverIndex) {
      exportedActions.setSelectedIndex(mouseDownIndex);
      game.modules.selectedView.selectView(Utils.ItemLocation.Container(container.id, mouseDownIndex));
    }
  });

  return { el, actions: exportedActions, subscribe };
}
