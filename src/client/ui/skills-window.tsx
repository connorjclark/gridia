import { render, h, Component } from 'preact';
import { ComponentProps, makeUIWindow, createSubApp } from './ui-common';

interface State {
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
    xp: number;
    xpBar: { current: number; max: number };
  }>;
}

export function makeSkillsWindow(initialState: State) {
  const actions = () => ({
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
  // TODO: rename Character.
  class SkillsWindow extends Component<Props> {
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
          Attributes
        </div>
        <div class='flex flex-wrap'>
          {props.attributes.map((attribute) => {
            const level = attribute.baseLevel + attribute.earnedLevel;
            const title = `base: ${attribute.baseLevel} earned: ${attribute.earnedLevel}`;
            return <div class='attribute' title={title}>
              {attribute.name} {level}
            </div>;
          })}
        </div>

        <br></br>

        <div>
          Skills
        </div>
        <div class='flex flex-wrap justify-evenly'>
          {skillsSortedByName.map((skill) => {
            const xpUntilNextLevel = skill.xpBar.max - skill.xpBar.current;
            const title =
              `${skill.name}–${skill.xp.toLocaleString()} xp (${xpUntilNextLevel.toLocaleString()} until next level)`;
            const percent = skill.xpBar.current / skill.xpBar.max;
            return <div class='skill' title={title}>
              <span class="flex justify-between items-center">
                <span>{skill.name}</span>
                <span class="skill__level">{skill.level}</span>
              </span>
              <div class="skill__xp-bar" style={{ '--percent': percent }}></div>
            </div>;
          })}
        </div>
      </div>;
    }
  }

  const { SubApp, exportedActions, subscribe } = createSubApp(SkillsWindow, initialState, actions);
  const el = makeUIWindow({ name: 'skills', cell: 'center' });
  render(<SubApp />, el);

  return { el, actions: exportedActions, subscribe };
}
