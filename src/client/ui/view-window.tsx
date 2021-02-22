import { render, h, Component } from 'preact';
import SelectedViewModule from '../modules/selected-view-module';
import * as Content from '../../content';
import { Graphic } from './ui-common';

export function makeViewWindow(selectedViewModule: SelectedViewModule) {
  let setState = (_: State) => {
    // Do nothing.
  };
  interface State {
    selectedView?: UIState['selectedView'];
    data?: Record<string, string>;
  }
  class ViewWindow extends Component {
    state: State = {};

    componentDidMount() {
      setState = this.setState.bind(this);
    }

    render(props: any, state: State) {
      if (!state.selectedView) return <div></div>;
      const selectedView = state.selectedView;

      let type: 'creature' | 'item' | undefined;
      let index;
      let quantity = 1;
      if (selectedView.creatureId) {
        type = 'creature';
        index = selectedViewModule.game.client.context.getCreature(selectedView.creatureId).image;
      } else if (selectedView.location?.source === 'world') {
        type = 'item';
        const item = selectedViewModule.game.client.context.map.getItem(selectedView.location.loc);
        const metaItem = item && Content.getMetaItem(item.type);
        if (metaItem && metaItem.animations) index = metaItem.animations[0] || 0;
        if (item) quantity = item.quantity;
      } else if (selectedView.location?.source === 'container') {
        type = 'item';
        const container = selectedViewModule.game.client.context.containers.get(selectedView.location.id);
        const item =
          container && selectedView.location.index !== undefined && container.items[selectedView.location.index];
        const metaItem = item && Content.getMetaItem(item.type);
        if (metaItem && metaItem.animations) index = metaItem.animations[0] || 0;
        if (item) quantity = item.quantity;
      }

      return <div>
        <div>
          View
        </div>
        <div>
          {type && index !== undefined && <Graphic type={type} index={index} quantity={quantity}></Graphic>}

          {Object.entries(state.data || {}).map(([key, value]) => {
            return <div>
              {key}: {value}
            </div>;
          })}

          {selectedView.actions.map((action) => {
            const dataset = selectedViewModule.game.createDataForActionEl({
              action,
              loc: selectedView.location?.source === 'world' ? selectedView.location.loc : undefined,
              creatureId: selectedView.creatureId,
            });
            return <button class='action' title={action.title} {...dataset}>{action.innerText}</button>;
          })}
        </div>
      </div>;
    }
  }

  const el = selectedViewModule.game.makeUIWindow({ name: 'view', cell: 'right' });
  render(<ViewWindow />, el);
  return { el, setState: (s: State) => setState(s) };
}
