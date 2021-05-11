import { render, h, Component } from 'preact';
import { useState } from 'preact/hooks';
import { ComponentProps, makeUIWindow, createSubApp, TabbedPane, TabbedPaneProps } from './ui-common';

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
    level: number;
    baseLevel: number;
    earnedLevel: number;
    buffAmount: number;
    xp: number;
    xpBar: { current: number; max: number };
    baseLevelFormula: string;
  }>;
  skillPoints: number;
  unlearnedSkills: Skill[];
  onLearnSkill: (id: number) => void;
}

export function makeSkillsWindow(initialState: State) {
  const actions = () => ({
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
  });

  type Props = ComponentProps<State, typeof actions>;

  class SkillsTab extends Component<Props> {
    render(props: Props) {
      const skillsSortedByName = Object.values(props.skills)
        .sort((a, b) => a.name.localeCompare(b.name));

      const combatXpUntilNextLevel = props.combatLevel.xpBar.max - props.combatLevel.xpBar.current;
      const combatLevelTitle = `combat xp until next level: ${combatXpUntilNextLevel.toLocaleString()}`;
      const combatLevelXpPercent = props.combatLevel.xpBar.current / props.combatLevel.xpBar.max;

      return <div>
        <div class="skill__xp-bar" title={combatLevelTitle} style={{ '--percent': combatLevelXpPercent }}>
          Combat Level {props.combatLevel.level}
        </div>

        <br></br>

        <div>
          Skills
        </div>
        <div class='flex flex-wrap justify-evenly'>
          {skillsSortedByName.map((skill) => {
            const xpUntilNextLevel = skill.xpBar.max - skill.xpBar.current;
            const percent = skill.xpBar.current / skill.xpBar.max;

            const skillEl = <div class='skill tooltip-on-hover'>
              <span class="flex justify-between items-center">
                <span>{skill.name}</span>
                {skill.buffAmount ? <span>+{skill.buffAmount}</span> : null}
                <span class="skill__level">{skill.level}</span>
              </span>
              <div class="skill__xp-bar" style={{ '--percent': percent }}></div>
            </div>;

            const l = (str: string | number) => str.toLocaleString();
            return <span style={{ width: '30%' }}>
              {skillEl}
              <div class='tooltip'>
                {skill.name} Lvl. {skill.level}
                <br></br>total xp: {l(skill.xp)}
                <br></br>xp until next level: {l(xpUntilNextLevel)}
                <br></br>base level = {skill.baseLevelFormula} = {skill.baseLevel}
                <br></br>buffed levels: {skill.buffAmount}
                <br></br>trained levels: {skill.earnedLevel}
              </div>
            </span>;
          })}
        </div>
      </div>;
    }
  }

  class AttributesTab extends Component<Props> {
    render(props: Props) {
      return <div>
        <div>Spendable XP: TODO</div>
        <div class='flex flex-wrap'>
          {props.attributes.map((attribute) => {
            const level = attribute.baseLevel + attribute.earnedLevel;
            const title = `base: ${attribute.baseLevel} earned: ${attribute.earnedLevel}`;
            return <div class='attribute' title={title} style={{ width: '50%' }}>
              {attribute.name} {level}
            </div>;
          })}
        </div>
      </div>;
    }
  }

  class LearnNewSkillTab extends Component<Props> {
    render(props: Props) {
      const [selectedId, setSelectedId] = useState<number|null>(null);

      return <div>
        <div>Skill Points: {props.skillPoints}</div>
        <div class="flex flex-wrap">
          {props.unlearnedSkills.map((skill) => {
            const classes = ['skill'];
            if (skill.id === selectedId) classes.push('selected');
            return <div class={classes.join(' ')} onClick={() => setSelectedId(skill.id)} style={{ width: '33%' }}>
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
    }
  }

  const tabs: TabbedPaneProps['tabs'] = {
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
  class SkillsWindow extends Component<Props> {
    render(props: Props) {
      return <TabbedPane tabs={tabs} childProps={props}></TabbedPane>;
    }
  }

  const { SubApp, exportedActions, subscribe } = createSubApp(SkillsWindow, initialState, actions);
  const el = makeUIWindow({ name: 'skills', cell: 'center' });
  render(<SubApp />, el);

  return { el, actions: exportedActions, subscribe };
}
