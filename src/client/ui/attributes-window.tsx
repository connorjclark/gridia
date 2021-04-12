import { render, h, Component } from 'preact';
import { ComponentProps, createSubApp, makeUIWindow } from './ui-common';

interface State {
  life: { value: number; max: number };
  stamina: { value: number; max: number };
  mana: { value: number; max: number };
}

export function makeAttributesWindow() {
  const initialState: State = {
    life: { value: 0, max: 0 },
    stamina: { value: 0, max: 0 },
    mana: { value: 0, max: 0 },
  };

  const actions = () => ({
    set: (state: State, key: keyof State, obj: State['life']): State => {
      return { ...state, [key]: { ...obj } };
    },
  });

  const Bar = (props: { label: string; color: string; value: number; max: number }) => {
    const percent = 100 * props.value / props.max;
    return <div class="bar">
      <div class="bar__label">
        <span>{props.label}:&nbsp;</span><span>{props.value}&nbsp;/&nbsp;{props.max}</span>
      </div>
      <div class="bar__bg" style={{ width: `${percent}%`, backgroundColor: props.color }}>&nbsp;</div>
    </div>;
  };

  type Props = ComponentProps<State, typeof actions>;
  class AttributesWindow extends Component<Props> {
    render(props: Props) {
      return <div>
        <div>
          <Bar label='Life' color='red' {...props.life}></Bar>
          <Bar label='Stamina' color='yellow' {...props.stamina}></Bar>
          <Bar label='Mana' color='blue' {...props.mana}></Bar>
        </div>
      </div>;
    }
  }

  const { SubApp, exportedActions, subscribe } = createSubApp(AttributesWindow, initialState, actions);
  const el = makeUIWindow({ name: 'attributes', cell: 'top', noscroll: true });
  render(<SubApp />, el);

  return { el, actions: exportedActions, subscribe };
}
