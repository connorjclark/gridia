import {render, h} from 'preact';
import {useState} from 'preact/hooks';

import * as Content from '../../content.js';
import * as CommandBuilder from '../../protocol/command-builder.js';
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

const getIndex = (e: PointerEvent): number | undefined => {
  const target = e.target as HTMLElement;
  const slotEl = target.closest('.container__slot') as HTMLElement;
  if (!slotEl) return;

  const index = Number(slotEl.dataset.index);
  return index;
};

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

      // Only allow selecting items with usages.
      const item = selectedIndex !== null && state.container.items[selectedIndex];
      if (item && Content.getItemUsesForTool(item.type).size === 0) {
        selectedIndex = null;
      }

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
  const ContainerWindow = (props: Props) => {
    let previewEl = <div></div>;
    if (props.equipmentWindow && props.equipmentWindow.equipmentGraphics) {
      previewEl = <CustomCreatureGraphic graphics={props.equipmentWindow.equipmentGraphics}></CustomCreatureGraphic>;
    }

    let statsEl = null;
    let actionsEl = null;
    if (props.equipmentWindow) {
      const stats: any = {...props.equipmentWindow.stats};
      stats.damage = `${props.equipmentWindow.stats.damageLow} - ${props.equipmentWindow.stats.damageHigh}`;
      delete stats.damageLow;
      delete stats.damageHigh;

      statsEl = <div>{Object.entries(stats).map(([key, value]) => {
        return <div>{key}: {value}</div>;
      })}</div>;
    } else {
      actionsEl = <div class="container__actions">
        <button onClick={() => {
          game.client.connection.sendCommand(CommandBuilder.containerAction({
            type: 'sort',
            id: props.container.id,
          }));
        }}>Sort</button>
        <button onClick={() => {
          game.client.connection.sendCommand(CommandBuilder.containerAction({
            type: 'stack',
            id: props.container.id,
          }));
        }}>Stack</button>
      </div>;
    }

    const [mouseDownIndex, setMouseDownIndex] = useState<number | null>(null);
    const [mouseOverIndex, setMouseOverIndex] = useState<number | null>(null);
    const onPointerDown = (e: PointerEvent) => {
      const index = getIndex(e);
      if (index === undefined || !props.container.items[index]) return;

      setMouseDownIndex(index);
      game.client.eventEmitter.emit('itemMoveBegin', {
        location: Utils.ItemLocation.Container(props.container.id, index),
        item: props.container.items[index] || undefined,
      });
    };
    const onPointerMove = (e: PointerEvent) => {
      const index = getIndex(e);
      if (index === undefined) return;

      setMouseOverIndex(index);
      // TODO: show selected view temporarily when hovering.
      // game.modules.selectedView.selectView(Utils.ItemLocation.Container(container.id, index));
    };
    const onPointerUp = () => {
      if (mouseOverIndex !== null) {
        game.client.eventEmitter.emit('itemMoveEnd', {
          location: Utils.ItemLocation.Container(container.id, mouseOverIndex),
        });
      }
      if (mouseDownIndex !== null && mouseDownIndex === mouseOverIndex) {
        if (container.type === 'normal') props.setSelectedIndex(mouseDownIndex);
        game.modules.selectedView.selectView(Utils.ItemLocation.Container(container.id, mouseDownIndex));
      }
      game.exitClickTileMode();
    };

    return <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
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
              title={metaItem.name}
            ></Graphic>;
          }

          const classes = ['container__slot'];
          if (props.selectedIndex === i) classes.push('container__slot--selected');

          return <div class={classes.join(' ')} data-index={i}>{gfx}</div>;
        })}
      </div>

      {actionsEl}
      {statsEl}
    </div>;
  };

  const {SubApp, exportedActions, subscribe} = createSubApp(ContainerWindow, initialState, actions);

  let delegate;
  if (container.type === 'equipment' && container.id === game.client.player.equipmentContainerId) {
    delegate = game.windowManager.createWindow({
      id: 'equipment',
      cell: 'center',
      tabLabel: 'Equipment',
      noscroll: true,
      onInit(el) {
        render(<SubApp />, el);
      },
    });
  } else if (container.type === 'normal' && container.id === game.client.player.containerId) {
    delegate = game.windowManager.createWindow({
      id: 'inventory',
      cell: 'right',
      tabLabel: 'Inventory',
      show: true,
      noscroll: true,
      onInit(el) {
        render(<SubApp />, el);
      },
    });
  } else {
    delegate = game.windowManager.createWindow({
      id: `container${container.id}`,
      cell: 'center',
      show: true,
      noscroll: true,
      onInit(el) {
        render(<SubApp />, el);
      },
    });
  }

  return {delegate, actions: exportedActions, subscribe};
}
