import { render, h, Component } from 'preact';
import { Graphic, Bar, ComponentProps, createSubApp, makeUIWindow } from './ui-common';

interface State {
  life: { current: number; max: number };
  stamina: { current: number; max: number };
  mana: { current: number; max: number };
  buffs: Array<{ name: string; expiresAt: number; skillName: string; percentChange?: number; linearChange?: number }>;
}

export function makeAttributesWindow() {
  const initialState: State = {
    life: { current: 0, max: 0 },
    stamina: { current: 0, max: 0 },
    mana: { current: 0, max: 0 },
    buffs: [],
  };

  const actions = () => ({
    setAttribute: (state: State, key: keyof State, obj: State['life']): State => {
      return { ...state, [key]: { ...obj } };
    },
    setBuffs: (state: State, buffs: State['buffs']): State => {
      return { ...state, buffs };
    },
  });

  type Props = ComponentProps<State, typeof actions>;
  class AttributesWindow extends Component<Props> {
    render(props: Props) {
      const buffs = [];
      for (const buff of props.buffs) {
        buffs.push(<div>
          <div class='buff tooltip-on-hover'>
            <Graphic file='rpgwo-animations0.png' index={6}></Graphic>
          </div>
          <div className="tooltip">
            {buff.name} (expires <span class='relative-time' data-time={buff.expiresAt}></span>)
            {buff.linearChange ? <div>+{buff.linearChange} {buff.skillName}</div> : null}
            {buff.percentChange ? <div>+{100 * buff.percentChange}% {buff.skillName}</div> : null}
          </div>
        </div>);
      }

      return <div>
        <div>
          <Bar label='Life' color='red' {...props.life}></Bar>
          <Bar label='Stamina' color='yellow' {...props.stamina}></Bar>
          <Bar label='Mana' color='blue' {...props.mana}></Bar>
        </div>
        <div class="flex">
          {buffs}
        </div>
      </div>;
    }
  }

  const { SubApp, exportedActions, subscribe } = createSubApp(AttributesWindow, initialState, actions);
  const el = makeUIWindow({ name: 'attributes', cell: 'top', noscroll: true });
  render(<SubApp />, el);

  return { el, actions: exportedActions, subscribe };
}
