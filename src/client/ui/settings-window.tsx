import {render, h, Component} from 'preact';

import {val} from '../../lib/link-state.js';
import {Game} from '../game.js';
import {SettingsSchema, Settings} from '../modules/settings-module.js';

import {ComponentProps, createSubApp} from './ui-common.js';

interface State {
  settings: Settings;
}

export function makeSettingsWindow(game: Game, initialState: State) {
  const actions = () => ({
    setSettings: (state: State, settings: Settings): State => {
      return {...state, settings};
    },
  });

  type Props = ComponentProps<State, typeof actions>;
  class SettingsWindow extends Component<Props> {
    render(props: Props) {
      return <div>
        <div>
          Settings
        </div>
        <div>
          {Object.entries(SettingsSchema).map(([key, schema]) => {
            // @ts-expect-error
            const value = props.settings[key];
            const update = (v: any) => props.setSettings({...props.settings, [key]: v});

            if (schema.type === 'boolean') {
              const attrs: any = {};
              if (value) attrs.checked = true;
              return <div>
                {schema.label}
                <input
                  onInput={(e) => update(val(e.target))}
                  type="checkbox"
                  setting-id={key}
                  {...attrs}
                ></input>
              </div>;
            } else if (schema.type === 'number') {
              const attrs = {
                value,
                min: schema.min,
                max: schema.max,
                step: schema.step,
              };
              return <div>
                {schema.label}
                <input
                  onInput={(e) => update(val(e.target))}
                  type="range"
                  setting-id={key}
                  {...attrs}
                ></input>
              </div>;
            }
          })}
        </div>
      </div>;
    }
  }

  const {SubApp, exportedActions, subscribe} = createSubApp(SettingsWindow, initialState, actions);
  game.windowManager.createWindow({
    id: 'settings',
    cell: 'center',
    tabLabel: 'Settings',
    onInit(el) {
      render(<SubApp />, el);
    },
  });

  return {actions: exportedActions, subscribe};
}
