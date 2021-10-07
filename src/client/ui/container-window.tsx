import {render, h, Component} from 'preact';

import * as Content from '../../content.js';
import * as Utils from '../../utils.js';
import {Game} from '../game.js';

import {Graphic, ComponentProps, createSubApp, CustomCreatureGraphic} from './ui-common.js';

interface State {
  name?: string;
  container: Pick<Container, 'id' | 'items'>;
  selectedIndex: number | null;
  // TODO: this should be a separate component.
  equipmentWindow?: {
    equipmentGraphics: Creature['equipmentGraphics'];
    stats: Creature['stats'];
  };
}

export function makeContainerWindow(game: Game, container: Container, name?: string) {
  const initialState: State = {
    name,
    container,
    selectedIndex: null,
  };

  const actions = () => ({
    setContainer: (state: State, container_: Container): State => {
      return {...state, container: {...container_}};
    },
    setSelectedIndex: (state: State, selectedIndex: number | null): State => {
      if (selectedIndex === state.selectedIndex) selectedIndex = null;

      // lol
      game.state.containers[state.container.id] = game.state.containers[state.container.id] || {};
      game.state.containers[state.container.id].selectedIndex = selectedIndex;

      // Selected item actions are based off currently selected tool. Fire
      // an event so the appropriate system can respond to changes.
      game.client.eventEmitter.emit('containerWindowSelectedIndexChanged');

      return {...state, selectedIndex};
    },
    setEquipmentWindow: (state: State, equipmentWindow: State['equipmentWindow']): State => {
      if (container.type !== 'equipment') return state;
      return {...state, equipmentWindow};
    },
  });

  type Props = ComponentProps<State, typeof actions>;
  class ContainerWindow extends Component<Props> {
    render(props: Props) {
      let previewEl = <div></div>;
      if (props.equipmentWindow && props.equipmentWindow.equipmentGraphics) {
        previewEl = <CustomCreatureGraphic graphics={props.equipmentWindow.equipmentGraphics}></CustomCreatureGraphic>;
      }

      let statsEl = null;
      if (props.equipmentWindow) {
        const stats: any = {...props.equipmentWindow.stats};
        stats.damage = `${props.equipmentWindow.stats.damageLow} - ${props.equipmentWindow.stats.damageHigh}`;
        delete stats.damageLow;
        delete stats.damageHigh;

        statsEl = <div>{Object.entries(stats).map(([key, value]) => {
          return <div>{key}: {value}</div>;
        })}</div>;
      }

      return <div>
        <div>
          {props.name || 'Container'}
        </div>
        <div class="container__slots">
          {previewEl}

          {props.container.items.map((item, i) => {
            let gfx;
            if (item) {
              const metaItem = Content.getMetaItem(item.type);
              gfx = <Graphic
                file={metaItem.graphics.file}
                index={metaItem.graphics.frames[0]}
                quantity={item.quantity}
              ></Graphic>;
            }

            const classes = ['container__slot'];
            if (props.selectedIndex === i) classes.push('container__slot--selected');

            return <div class={classes.join(' ')} data-index={i}>{gfx}</div>;
          })}
        </div>
        {statsEl}
      </div>;
    }
  }

  const {SubApp, exportedActions, subscribe} = createSubApp(ContainerWindow, initialState, actions);

  let id;
  if (container.type === 'equipment' && container.id === game.client.player.equipmentContainerId) {
    id = game.windowManager.createWindow({
      id: 'equipment',
      cell: 'center',
      tabLabel: 'Equipment',
      noscroll: true,
      onInit(el) {
        render(<SubApp />, el);
        addListeners(el);
      },
    }).id;
  } else if (container.type === 'normal' && container.id === game.client.player.containerId) {
    id = game.windowManager.createWindow({
      id: 'inventory',
      cell: 'right',
      tabLabel: 'Inventory',
      show: true,
      noscroll: true,
      onInit(el) {
        render(<SubApp />, el);
        addListeners(el);
      },
    }).id;
  } else {
    id = game.windowManager.createWindow({
      id: `container${container.id}`,
      cell: 'center',
      noscroll: true,
      onInit(el) {
        render(<SubApp />, el);
        addListeners(el);
      },
    }).id;
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

  function addListeners(el: HTMLElement) {
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
        if (container.type === 'normal') exportedActions.setSelectedIndex(mouseDownIndex);
        game.modules.selectedView.selectView(Utils.ItemLocation.Container(container.id, mouseDownIndex));
      }
    });
  }

  return {id, actions: exportedActions, subscribe};
}
