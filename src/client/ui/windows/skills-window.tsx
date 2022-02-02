import {render, h, Fragment} from 'preact';
import {useState} from 'preact/hooks';

import * as Player from '../../../player.js';
import {Game} from '../../game.js';
import {TabbedPane} from '../components/tabbed-pane.js';
import {c, ComponentProps, createSubApp} from '../ui-common.js';

export interface State {
  combatLevel: {
    level: number;
    xpBar: { current: number; max: number };
  };
  attributes: Array<{
    name: string;
    earnedLevel: number;
    baseLevel: number;
  }>;
  skills: Array<{
    id: number;
    name: string;
    learned: boolean;
    specialized: boolean;
    level: number;
    baseLevel: number;
    earnedLevel: number;
    buffAmount: number;
    xp: number;
    xpBar: { current: number; max: number };
    baseLevelFormula: string;
  }>;
  skillPoints: number;
  spendableXp: number;
  unlearnedSkills: Skill[];
  onLearnSkill: (id: number) => void;
  onIncrementAttribute: (name: string) => void;
}

export function makeSkillsWindow(game: Game, initialState: State) {
  const actions = {
    setState(state: State, newState: State) {
      return {
        ...state,
        ...newState,
      };
    },
    setCombatLevel: (state: State, combatLevel: State['combatLevel']): State => {
      return {
        ...state,
        combatLevel,
      };
    },
    setSkills: (state: State, skills: State['skills']): State => {
      return {
        ...state,
        skills,
      };
    },
    setSkill: (state: State, skill: State['skills'][number]): State => {
      const index = state.skills.findIndex((s) => s.id === skill.id);
      const skills = [...state.skills];
      if (index === -1) skills.push(skill);
      else skills[index] = skill;

      return {
        ...state,
        skills,
      };
    },
    setSpendableXp: (state: State, spendableXp: number): State => {
      return {
        ...state,
        spendableXp,
      };
    },
  };

  type Props = ComponentProps<State, typeof actions>;

  const SkillsTab = (props: Props) => {
    const fmt = (num: number) => num > 0 ? `+${num}` : num;
    const l = (str: string | number) => str.toLocaleString();

    const combatXpUntilNextLevel = props.combatLevel.xpBar.max - props.combatLevel.xpBar.current;
    const combatLevelTitle = `combat xp until next level: ${combatXpUntilNextLevel.toLocaleString()}`;
    const combatLevelXpPercent = props.combatLevel.xpBar.current / props.combatLevel.xpBar.max;

    return <div>
      <div class="skill__xp-bar" title={combatLevelTitle} style={{'--percent': combatLevelXpPercent}}>
        Combat Level {props.combatLevel.level}
      </div>

      <br></br>

      <div class='flex flex-wrap justify-evenly'>
        {props.skills.map((skill) => {
          const xpUntilNextLevel = skill.xpBar.max - skill.xpBar.current;
          const percent = skill.xpBar.current / skill.xpBar.max;

          let skillEl;
          let tooltipEl;
          if (skill.learned) {
            skillEl = <div class={c(
              'skill tooltip-on-hover',
              skill.learned && 'skill--learned',
              skill.specialized && 'skill--specialized'
            )}>
              <span class="flex justify-between items-center">
                <span>{skill.name}</span>
                {skill.buffAmount ? <span>{fmt(skill.buffAmount)}</span> : null}
                <span class="skill__level">{skill.level}</span>
              </span>
              <div class="skill__xp-bar" style={{'--percent': percent}}></div>
            </div>;
            tooltipEl = <>
              {skill.name} Lvl. {skill.level}
              <br></br>total xp: {l(skill.xp)}
              <br></br>xp until next level: {l(xpUntilNextLevel)}
              <br></br>base level = {skill.baseLevelFormula} = {skill.baseLevel}
              <br></br>buffed levels: {fmt(skill.buffAmount)}
              <br></br>trained levels: {skill.earnedLevel}
              <br></br>{skill.specialized ? 'specialized' : ''}
            </>;
          } else {
            skillEl = <div class={'skill tooltip-on-hover skill--not-learned'}>
              <span class="flex justify-between items-center">
                <span>{skill.name}</span>
                <span class="skill__level">–</span>
              </span>
            </div>;
            tooltipEl = <>
              {skill.name}
              <br></br>NOT LEARNED
            </>;
          }

          return <span style={{width: '30%'}}>
            {skillEl}
            <div class='tooltip'>{tooltipEl}</div>
          </span>;
        })}
      </div>
    </div>;
  };

  const AttributesTab = (props: Props) => {
    return <div>
      <div>Spendable XP: {props.spendableXp}</div>
      <div class='attributes'>
        {props.attributes.map((attribute) => {
          const level = attribute.baseLevel + attribute.earnedLevel;
          const cost = Player.costToIncrementSkillOrAttribute(attribute.earnedLevel);

          return <div class='flex items-center'>
            <button
              class="tooltip-on-hover m1"
              disabled={cost > props.spendableXp}
              onClick={() => props.onIncrementAttribute(attribute.name)}>+</button>
            <div class="tooltip">
              <div>{cost} xp to increase</div>
              <div>base: {attribute.baseLevel} earned: {attribute.earnedLevel}</div>
            </div>

            <span>{attribute.name} {level}</span>
          </div>;
        })}
      </div>
    </div>;
  };

  const LearnNewSkillTab = (props: Props) => {
    const [selectedId, setSelectedId] = useState<number | null>(null);

    return <div>
      <div>Skill Points: {props.skillPoints}</div>
      <div class="flex flex-wrap">
        {props.unlearnedSkills.map((skill) => {
          const classes = ['skill'];
          if (skill.id === selectedId) classes.push('selected');

          return <div
            class={c('skill', skill.id === selectedId && 'selected')}
            onClick={() => setSelectedId(skill.id)} style={{width: '33%'}}
          >
            {skill.name} ({skill.skillPoints})
          </div>;
        })}
      </div>
      <button onClick={() => {
        if (selectedId !== null) {
          props.onLearnSkill(selectedId);
          setSelectedId(null);
        }
      }}>Learn</button>
    </div>;
  };

  const tabs = {
    skills: {
      label: 'Skills',
      content: SkillsTab,
    },
    attributes: {
      label: 'Attributes',
      content: AttributesTab,
    },
    learn: {
      label: 'Learn New Skill',
      content: LearnNewSkillTab,
    },
  };

  // TODO: rename Character.
  const SkillsWindow = (props: Props) => {
    return <TabbedPane tabs={tabs} childProps={props}></TabbedPane>;
  };

  const {SubApp, exportedActions, subscribe} = createSubApp(SkillsWindow, initialState, actions);
  game.windowManager.createWindow({
    id: 'skills',
    cell: 'center',
    tabLabel: 'Skills',
    onInit(el) {
      render(<SubApp />, el);
    },
  });

  return {actions: exportedActions, subscribe};
}
