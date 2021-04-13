import { render, h, Component } from 'preact';
import { ComponentProps, makeUIWindow, createSubApp } from './ui-common';

interface State {
  skills: Array<{ id: number; name: string; level: number; xp: number; xpUntilNextLevel: number }>;
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
  class SkillsWindow extends Component<Props> {
    render(props: Props) {
      const skillsSortedByName = Object.values(props.skills)
        .sort((a, b) => a.name.localeCompare(b.name));
      return <div>
        <div>
          Skills
        </div>
        <div>
          {skillsSortedByName.map((skill) => {
            const title = `${skill.xp} xp (${skill.xpUntilNextLevel} until next level)`;
            return <div title={title}>{skill.name} - {skill.level}</div>;
          })}
        </div>
      </div>;
    }
  }

  const { SubApp, exportedActions, subscribe } = createSubApp(SkillsWindow, initialState, actions);
  const el = makeUIWindow({ name: 'skills', cell: 'right' });
  render(<SubApp />, el);

  return { el, actions: exportedActions, subscribe };
}
