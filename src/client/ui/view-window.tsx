import { render, h, Component } from 'preact';
import SelectedViewModule from '../modules/selected-view-module';

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

      return <div>
        <div>
          View
        </div>
        <div>
          {state.selectedView.actions.map((action) => {
            const dataset = selectedViewModule.game.createDataForActionEl({
              action,
              loc: state.selectedView?.tile,
              creatureId: state.selectedView?.creatureId,
            });
            return <button class='action' title={action.title} {...dataset}>{action.innerText}</button>;
          })}

          {Object.entries(state.data || {}).map(([key, value]) => {
            return <div>
              {key}: {value}
            </div>;
          })}
        </div>
      </div>;
    }
  }

  const el = selectedViewModule.game.makeUIWindow();
  el.classList.add('ui-view');
  render(<ViewWindow />, el);
  return { el, setState: (s: State) => setState(s) };
}
