import {render, h, Component} from 'preact';

import * as Content from '../../content.js';
import {val} from '../../lib/link-state.js';
import {SelectedViewModule} from '../modules/selected-view-module.js';

import {Graphic, ComponentProps, createSubApp, Bar, CustomCreatureGraphic} from './ui-common.js';

interface State {
  selectedView?: UIState['selectedView'];
  data?: Record<string, string | { type: 'bar'; color: string; current: number; max: number }>;
  quantity?: number;
}

export function makeViewWindow(selectedViewModule: SelectedViewModule) {
  const initialState: State = {};

  const actions = () => ({
    setView: (state: State, newState: State): State => {
      return {...newState, quantity: undefined};
    },
    setQuantity: (state: State, quantity: number): State => {
      return {...state, quantity};
    },
  });

  type Props = ComponentProps<State, typeof actions>;
  class ViewWindow extends Component<Props> {
    render(props: Props) {
      if (!props.selectedView) return <div></div>;
      const selectedView = props.selectedView;

      let equipmentGraphics;
      let file = '';
      let index;
      let quantity = 1;
      if (selectedView.creatureId) {
        const creature = selectedViewModule.game.client.context.getCreature(selectedView.creatureId);
        file = creature.graphics.file;
        index = creature.graphics.frames[0];
        equipmentGraphics = creature.equipmentGraphics;
      } else if (selectedView.location?.source === 'world') {
        const item = selectedViewModule.game.client.context.map.getItem(selectedView.location.loc);
        const metaItem = item && Content.getMetaItem(item.type);
        if (metaItem) {
          file = metaItem?.graphics.file;
          index = metaItem?.graphics.frames[0];
          if (item) quantity = item.quantity;
        }
      } else if (selectedView.location?.source === 'container') {
        const container = selectedViewModule.game.client.context.containers.get(selectedView.location.id);
        const item =
          container && selectedView.location.index !== undefined && container.items[selectedView.location.index];
        const metaItem = item ? Content.getMetaItem(item.type) : undefined;
        if (metaItem) {
          file = metaItem.graphics.file;
          index = metaItem.graphics.frames[0];
          if (item) quantity = item.quantity;
        }
      }

      let img;
      if (equipmentGraphics && equipmentGraphics.length) {
        img = <CustomCreatureGraphic graphics={equipmentGraphics}></CustomCreatureGraphic>;
      } else if (file && index !== undefined) {
        img = <Graphic file={file} index={index} quantity={quantity}></Graphic>;
      }

      return <div>
        <div>
          View
        </div>
        <div>
          {img}

          {Object.entries(props.data || {}).map(([key, value]) => {
            if (typeof value !== 'string' && value.type === 'bar') {
              return <Bar label={key} {...value}></Bar>;
            }

            return <div>
              {key}: {value}
            </div>;
          })}

          {selectedView.actions.map((action) => {
            const dataset = selectedViewModule.game.createDataForActionEl({
              action,
              location: selectedView.location,
              creatureId: selectedView.creatureId,
            });

            const children = [];
            if (action.type === 'split' && quantity > 1) {
              const quantityToSplit = props.quantity || 1;
              children.push(
                <input
                  type="number"
                  onInput={(e) => props.setQuantity(val(e.target))}
                  value={quantityToSplit}
                  min="1"
                  max={quantity - 1}
                  step="1">
                </input>
              );
              // @ts-expect-error
              dataset['data-quantity'] = quantityToSplit;
            }

            return <div>
              <button class='action' title={action.title} {...dataset}>{action.innerText}</button>
              {children}
            </div>;
          })}
        </div>
      </div>;
    }
  }

  const {SubApp, exportedActions, subscribe} = createSubApp(ViewWindow, initialState, actions);
  const delegate = selectedViewModule.game.windowManager.createWindow({
    id: 'view',
    cell: 'right',
    noscroll: true,
    onInit(el) {
      render(<SubApp />, el);
    },
  });

  return {delegate, actions: exportedActions, subscribe};
}
