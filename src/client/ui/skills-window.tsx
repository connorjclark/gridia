import { render, h, Component } from 'preact';
import SkillsModule from '../modules/skills-module';

export function makeSkillsWindow(skillsModule: SkillsModule) {
  let setState = (_: State) => {
    // Do nothing.
  };
  interface State {
    skills: Array<{ id: number; name: string; xp?: number }>;
  }
  class SkillsWindow extends Component {
    state: State = {skills: []};

    componentDidMount() {
      setState = this.setState.bind(this);
    }

    render(props: any, state: State) {
      return <div class="ui-skills">
        <div>
          Skills
        </div>
        <div>
          {state.skills.map((skill) => {
            return <div>{skill.name} - {skill.xp || 0}</div>;
          })}
        </div>
      </div>;
    }
  }

  const el = skillsModule.game.makeUIWindow();
  render(<SkillsWindow />, el);
  return { el, setState: (s: State) => setState(s) };
}
