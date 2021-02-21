import { render, h, Component } from 'preact';
import SettingsModule, { SettingsSchema, Settings } from '../modules/settings-module';
import linkState from '../../lib/link-state';

export function makeSettingsWindow(settingsModule: SettingsModule) {
  let setState = (_: Partial<State>) => {
    // Do nothing.
  };
  interface State {
    settings?: Settings;
  }
  class SettingsWindow extends Component {
    state: State = {};

    // TODO: don't think this is needed... remove?
    componentDidMount() {
      setState = this.setState.bind(this);
    }

    render(props: any, state: State) {
      if (!state.settings) return;

      return <div>
        <div>
          Settings
        </div>
        <div>
          {Object.entries(SettingsSchema).map(([key, schema]) => {
            // @ts-ignore
            const value = state.settings[key];

            if (schema.type === 'boolean') {
              const attrs: any = {};
              if (value) attrs.checked = true;
              return <div>
                {key}
                <input
                  onInput={linkState(this, `settings.${key}`)}
                  type="checkbox"
                  setting-id={key}
                  {...attrs}
                >
                  {schema.label}
                </input>
              </div>;
            } else if (schema.type === 'number') {
              const attrs = {
                value,
                min: schema.min,
                max: schema.max,
                step: schema.step,
              };
              return <div>
                {key}
                <input
                  onInput={linkState(this, `settings.${key}`)}
                  type="range"
                  setting-id={key}
                  {...attrs}
                >
                  {schema.label}
                </input>
              </div>;
            }
          })}
        </div>
      </div>;
    }
  }

  const el = settingsModule.game.makeUIWindow({name: 'settings', cell: 'center'});
  render(<SettingsWindow />, el);
  return { el, setState: (s: Partial<State>) => setState(s) };
}
