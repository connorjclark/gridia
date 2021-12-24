import {render, h, Component} from 'preact';
import {useEffect, useState} from 'preact/hooks';

import {val} from '../../lib/link-state.js';
import * as CommandBuilder from '../../protocol/command-builder.js';
import {Game} from '../game.js';
import {findKeyNameForValue, KEYS} from '../keys.js';
import {SettingsSchema} from '../modules/settings-module.js';

import {ComponentProps, createSubApp} from './ui-common.js';

interface State {
  settings: Settings;
}

function bindingToString(binding: Binding) {
  let result;
  if (binding.key !== undefined) {
    result = findKeyNameForValue(binding.key);
  } else if (binding.mouse !== undefined) {
    result = ['left click', 'middle click', 'right click'][binding.mouse] || '?';
  } else {
    result = '?';
  }

  const modifiers = [];
  if (binding.shift) modifiers.push('Shift');
  if (binding.control) modifiers.push('Control');
  if (binding.alt) modifiers.push('Alt');
  // @ts-expect-error
  if (binding.meta) modifiers.push(navigator.userAgentData.platform === 'macOS' ? 'Command' : 'Meta');

  if (modifiers.length) {
    result = [...modifiers, result].join(' + ');
  }

  return result;
}

interface BindingsProps {
  bindings: Settings['bindings'];
  setBindings: (newBindings: Settings['bindings']) => void;
}
const Bindings = (props: BindingsProps) => {
  const [selectedBinding, setSelectedBinding] = useState<keyof Settings['bindings'] | null>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.keyCode === KEYS.ESCAPE) setSelectedBinding(null);
    };
    document.addEventListener('keyup', fn);

    return () => document.removeEventListener('keyup', fn);
  }, []);

  useEffect(() => {
    const fn1 = (e: KeyboardEvent) => {
      if (selectedBinding) {
        props.setBindings({
          ...props.bindings,
          [selectedBinding]: {key: e.keyCode, shift: e.shiftKey, control: e.ctrlKey, alt: e.altKey, meta: e.metaKey},
        });
        setSelectedBinding(null);
      }
    };
    const fn2 = (e: MouseEvent) => {
      if (selectedBinding) {
        props.setBindings({
          ...props.bindings,
          [selectedBinding]: {mouse: e.button, shift: e.shiftKey, control: e.ctrlKey, alt: e.altKey, meta: e.metaKey},
        });
        setSelectedBinding(null);
      }
    };
    document.addEventListener('keyup', fn1, {once: true});
    document.addEventListener('click', fn2, {once: true});
    document.addEventListener('auxclick', fn2, {once: true});

    return () => {
      document.removeEventListener('keyup', fn1);
      document.removeEventListener('click', fn2);
      document.removeEventListener('auxclick', fn2);
    };
  }, [selectedBinding]);

  return <div class="bindings">
    {Object.entries(props.bindings).map(([bindingName, binding]) => {
      return <div class={`grid-contents binding ${selectedBinding === bindingName ? 'binding--selected' : ''}`}>
        <label>{bindingName}</label>
        <span class='binding__span'
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => setSelectedBinding(bindingName as keyof Settings['bindings'])}
        >{bindingToString(binding)}</span>
      </div>;
    })}
  </div>;
};

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

          <Bindings
            bindings={props.settings.bindings}
            setBindings={(bindings) => props.setSettings({...props.settings, bindings})}></Bindings>
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
    onHide() {
      game.client.connection.sendCommand(CommandBuilder.saveSettings({settings: game.client.settings}));
    },
  });

  return {actions: exportedActions, subscribe};
}
