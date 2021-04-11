import { render, h, Component } from 'preact';
import { ComponentProps, makeUIWindow, createSubApp } from './ui-common';

interface State {
  skills: Record<number, { id: number; name: string; xp?: number }>;
}

export function makeSkillsWindow(initialState: State) {
  const actions = () => ({
    setSkills: (state: State, skills: State['skills']): State => {
      return {
        ...state,
        skills,
      };
    },
    setSkill: (state: State, skill: { id: number; name: string; xp?: number }): State => {
      return {
        skills: {
          ...state.skills,
          [skill.id]: skill,
        },
      };
    },
  });

  type Props = ComponentProps<State, typeof actions>;
  class SkillsWindow extends Component<Props> {
    render(props: Props) {
      return <div>
        <div>
          Skills
        </div>
        <div>
          {Object.values(props.skills).map((skill) => {
            return <div>{skill.name} - {skill.xp || 0}</div>;
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
