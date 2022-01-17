import {render, h, Fragment} from 'preact';

import {Game} from '../game.js';

import {Graphic, Bar, ComponentProps, createSubApp} from './ui-common.js';

interface State {
  life: { current: number; max: number };
  stamina: { current: number; max: number };
  mana: { current: number; max: number };
  buffs: Array<{ name: string; expiresAt: number; skillName: string; percentChange?: number; linearChange?: number }>;
}

export function makeAttributesWindow(game: Game) {
  const initialState: State = {
    life: {current: 0, max: 0},
    stamina: {current: 0, max: 0},
    mana: {current: 0, max: 0},
    buffs: [],
  };

  const actions = () => ({
    setAttribute: (state: State, key: keyof State, obj: State['life']): State => {
      return {...state, [key]: {...obj}};
    },
    setBuffs: (state: State, buffs: State['buffs']): State => {
      return {...state, buffs};
    },
  });

  type Props = ComponentProps<State, typeof actions>;
  const AttributesWindow = (props: Props) => {
    const buffs = [];
    for (const buff of props.buffs) {
      const expiresAtMarkup = buff.expiresAt > 0 ?
        <>(expires <span class='relative-time' data-time={buff.expiresAt}></span>)</> :
        null;

      buffs.push(<div>
        <div class='buff tooltip-on-hover'>
          <Graphic file='rpgwo-animations0.png' index={6}></Graphic>
        </div>
        <div className="tooltip">
          {buff.name} {expiresAtMarkup}
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
  };

  const {SubApp, exportedActions, subscribe} = createSubApp(AttributesWindow, initialState, actions);
  game.windowManager.createWindow({
    id: 'attributes',
    cell: 'bottom',
    show: true,
    noscroll: true,
    onInit(el) {
      render(<SubApp />, el);
    },
  });

  return {actions: exportedActions, subscribe};
}
