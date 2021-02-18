import * as Content from '../../content';
import ClientModule from '../client-module';
import Game from '../game';
import * as Helper from '../helper';
import {makeSkillsWindow} from '../ui/skills-window';

class SkillsModule extends ClientModule {
  protected panel: HTMLElement;
  protected skillsWindow?: ReturnType<typeof makeSkillsWindow>;

  constructor(game: Game) {
    super(game);
    this.panel = Helper.find('.panel--skills');
  }

  getSkillsWindow() {
    if (this.skillsWindow) return this.skillsWindow;
    this.skillsWindow = makeSkillsWindow(this);
    return this.skillsWindow;
  }

  onStart() {
    this.game.client.eventEmitter.on('message', (e) => {
      if (e.type === 'xp') {
        const statusTextEl = document.createElement('div');
        statusTextEl.classList.add('status-text');
        setTimeout(() => statusTextEl.classList.add('status-text--remove'), 500);
        statusTextEl.innerText = `+${e.args.xp}xp ${Content.getSkill(e.args.skill).name}`;
        // TODO: add one listener to .status-texts
        statusTextEl.addEventListener('transitionend', () => statusTextEl.remove());
        Helper.find('.status-texts').appendChild(statusTextEl);

        this.getSkillsWindow().setState({skills: this.getSkills()});
      }
    });

    this.game.client.eventEmitter.on('panelFocusChanged', ({ panelName }) => {
      if (panelName === 'skills') {
        this.getSkillsWindow().el.hidden = false;
        this.getSkillsWindow().setState({skills: this.getSkills()});
      } else if (this.skillsWindow) {
        this.getSkillsWindow().el.hidden = true;
      }
    });
  }

  getSkills() {
    const skillIdsSortedByName = [...this.game.client.player.skills.keys()].sort(
      (a, b) => Content.getSkill(a).name.localeCompare(Content.getSkill(b).name));
    return skillIdsSortedByName.map((id) => {
      const skill = Content.getSkill(id);
      const xp = this.game.client.player.skills.get(id);
      return {
        ...skill,
        xp,
      };
    });
  }
}

export default SkillsModule;
