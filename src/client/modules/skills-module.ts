import * as Content from '../../content';
import ClientModule from '../client-module';
import * as Helper from '../helper';
import { makeSkillsWindow } from '../ui/skills-window';

class SkillsModule extends ClientModule {
  protected skillsWindow?: ReturnType<typeof makeSkillsWindow>;

  getSkillsWindow() {
    if (this.skillsWindow) return this.skillsWindow;
    this.skillsWindow = makeSkillsWindow({ skills: this.getSkills() });
    return this.skillsWindow;
  }

  onStart() {
    this.game.client.eventEmitter.on('event', (e) => {
      if (!this.skillsWindow) return;

      if (e.type === 'xp') {
        const statusTextEl = document.createElement('div');
        statusTextEl.classList.add('status-text');
        setTimeout(() => statusTextEl.classList.add('status-text--remove'), 500);
        statusTextEl.innerText = `+${e.args.xp}xp ${Content.getSkill(e.args.skill).name}`;
        // TODO: add one listener to .status-texts
        statusTextEl.addEventListener('transitionend', () => statusTextEl.remove());
        Helper.find('.status-texts').appendChild(statusTextEl);
        this.getSkillsWindow().actions.setSkill(this.getSkill(e.args.skill));
      }
    });

    this.game.client.eventEmitter.on('panelFocusChanged', ({ panelName }) => {
      if (panelName === 'skills') {
        this.getSkillsWindow().el.hidden = false;
        this.getSkillsWindow().actions.setSkills(this.getSkills());
      } else if (this.skillsWindow) {
        this.getSkillsWindow().el.hidden = true;
      }
    });
  }

  getSkill(id: number) {
    const skill = Content.getSkill(id);
    const xp = this.game.client.player.skills.get(id);
    return {
      ...skill,
      xp,
    };
  }

  getSkills() {
    const skillIdsSortedByName = [...this.game.client.player.skills.keys()].sort(
      (a, b) => Content.getSkill(a).name.localeCompare(Content.getSkill(b).name));
    return skillIdsSortedByName.map((id) => this.getSkill(id));
  }
}

export default SkillsModule;
