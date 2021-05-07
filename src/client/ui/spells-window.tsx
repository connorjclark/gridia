import { render, h, Component } from 'preact';
import { useEffect } from 'preact/hooks';
import * as Content from '../../content';
import * as Helper from '../helper';
import { Graphic, ComponentProps, createSubApp, makeUIWindow } from './ui-common';

interface State {
  spells: Spell[];
  tab: string;
  globalCooldown: number;
  cooldowns: Record<number, number>;
}

export function makeSpellsWindow(onCastSpell: (spell: Spell) => void) {
  const initialState: State = {
    spells: Content.getSpells(),
    tab: 'Dark Magic',
    // TODO: should cooldown just apply to all spells?
    globalCooldown: 0,
    cooldowns: {},
  };
  for (const spell of initialState.spells) {
    if (spell) initialState.cooldowns[spell.id] = 0;
  }

  const actions = () => ({
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
    setTab: (state: State, tab: string): State => {
      return {
        ...state,
        tab,
      };
    },
  });

  const tabs = Content.getSkills()
    .filter((s) => s && s.name.includes('Magic') && !s.name.includes('Defense'))
    .map((s) => {
      return {name: s.name, skill: s.id};
    });

  type Props = ComponentProps<State, typeof actions>;
  class SpellsWindow extends Component<Props> {
    render(props: Props) {
      useEffect(() => {
        const handle = setInterval(() => {
          const now = Date.now();
          for (const spellEl of Helper.findAll('.spell', el)) {
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

      const tab = tabs.find((t) => t.name === props.tab);
      if (!tab) throw new Error('no tab');
      const currentSpells = props.spells.filter((spell) => spell && spell.skill === tab.skill);

      const spells = [];
      for (const spell of currentSpells) {
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

      return <div>
        <h2>Spells</h2>
        <div class="tabs flex justify-around">
          {tabs.map((t) => {
            return <div class={t === tab ? 'selected' : ''} onClick={() => props.setTab(t.name)}>{t.name}</div>;
          })}
        </div>
        <div class="flex flex-wrap" style={{ maxHeight: '20vh', overflow: 'scroll' }}>
          {spells}
        </div>
      </div>;
    }

    onClickSpell(spell: Spell) {
      const now = Date.now();
      if (now > this.props.globalCooldown && now > this.props.cooldowns[spell.id]) {
        this.props.useSpell(spell.id);
        onCastSpell(spell);
      }
    }
  }

  const { SubApp, exportedActions, subscribe } = createSubApp(SpellsWindow, initialState, actions);
  const el = makeUIWindow({ name: 'spells', cell: 'center', noscroll: true });
  render(<SubApp />, el);

  return { el, actions: exportedActions, subscribe };
}
