import {render, h, Component} from 'preact';
import {useEffect} from 'preact/hooks';

import * as Content from '../../content.js';
import {game} from '../../game-singleton.js';
import * as Helper from '../helper.js';

import {Graphic} from './components/graphic.js';
import {TabbedPane, TabbedPaneProps} from './components/tabbed-pane.js';
import {ComponentProps, createSubApp} from './ui-common.js';

interface State {
  spells: Spell[];
  globalCooldown: number;
  cooldowns: Record<number, number>;
}

export function makeSpellsWindow(onCastSpell: (spell: Spell) => void) {
  const initialState: State = {
    spells: Content.getSpells(),
    // TODO: should cooldown just apply to all spells?
    globalCooldown: 0,
    cooldowns: {},
  };
  for (const spell of initialState.spells) {
    if (spell) initialState.cooldowns[spell.id] = 0;
  }

  const actions = {
    // TODO: shouldn't all of these return Partial<State> ?
    useSpell: (state: State, spellId: number): State => {
      const now = Date.now();

      return {
        ...state,
        globalCooldown: now + 1500,
        cooldowns: {
          ...state.cooldowns,
          [spellId]: now + state.spells[spellId].castTime * 1000,
        },
      };
    },
  };

  const tabs: TabbedPaneProps['tabs'] = {};
  for (const skill of Content.getSkills()) {
    if (skill && skill.name.includes('Magic') && !skill.name.includes('Defense')) {
      tabs[skill.name] = {
        label: skill.name,
        content: (props: Props) => <SpellsTab
          {...props}
          spells={props.spells.filter((s) => s && s.skill === skill.id)}></SpellsTab>,
      };
    }
  }

  type Props = ComponentProps<State, typeof actions>;

  // TODO: use functions instead of classes
  class SpellsTab extends Component<Props> {
    render(props: Props) {
      const spells = [];
      for (const spell of props.spells) {
        const cooldown = Math.max(props.cooldowns[spell.id], props.globalCooldown);
        const animationIndex = spell.animation ? Content.getAnimationByIndex(spell.animation - 1).frames[0].sprite : 11;
        spells.push(<div onClick={() => this.onClickSpell(spell)}>
          <div class='spell tooltip-on-hover' data-cooldown={cooldown}>
            <Graphic file='rpgwo-animations0.png' index={animationIndex}></Graphic>
            <span class='timer'></span>
          </div>
          <div className="tooltip">
            <div>{spell.name}</div>
            <div>{spell.description}</div>
            <div>Mana: {spell.mana}</div>
          </div>
        </div>);
      }

      return <div class="flex flex-wrap" style={{overflow: 'auto'}}>
        {spells}
      </div>;
    }

    onClickSpell(spell: Spell) {
      const now = Date.now();
      if (now > this.props.globalCooldown && now > this.props.cooldowns[spell.id]) {
        this.props.useSpell(spell.id);
        onCastSpell(spell);
      }
      game.focus();
    }
  }

  const SpellsWindow = (props: Props) => {
    useEffect(() => {
      const handle = setInterval(() => {
        if (!el_) return;

        const now = Date.now();
        for (const spellEl of Helper.findAll('.spell', el_)) {
          const cooldown = Number(spellEl.getAttribute('data-cooldown'));
          const seconds = cooldown > now ? (cooldown - now) / 1000 : 0;
          const timerEl = Helper.find('.timer', spellEl);
          timerEl.textContent = seconds.toFixed(1);
          timerEl.hidden = seconds === 0;

          const graphicEl = Helper.find('.graphic', spellEl);
          graphicEl.style.opacity = seconds === 0 ? '1' : '0.3';
        }
      }, 50);
      return () => clearInterval(handle);
    }, []);

    return <TabbedPane tabs={tabs} childProps={props}></TabbedPane>;
  };

  const {SubApp, exportedActions, subscribe} = createSubApp(SpellsWindow, initialState, actions);
  let el_: HTMLElement; // TODO: remove
  game.windowManager.createWindow({
    id: 'spells',
    cell: 'center',
    tabLabel: 'Spells',
    noscroll: true,
    onInit(el) {
      el_ = el;
      render(<SubApp />, el);
    },
  });

  return {actions: exportedActions, subscribe};
}
