import * as Content from '../../content';
import * as Player from '../../player';
import * as Helper from '../helper';
import ClientModule from '../client-module';
import { makeSkillsWindow } from '../ui/skills-window';

class SkillsModule extends ClientModule {
  protected skillsWindow?: ReturnType<typeof makeSkillsWindow>;

  getSkillsWindow() {
    if (this.skillsWindow) return this.skillsWindow;


    const combatLevelDetails = Player.getCombatLevel(this.game.client.player);
    this.skillsWindow = makeSkillsWindow({
      combatLevel: {
        level: combatLevelDetails.combatLevel,
        xpBar: {
          current: combatLevelDetails.xp,
          max: combatLevelDetails.xp + combatLevelDetails.xpUntilNextLevel,
        },
      },
      attributes: this.getAttributes(),
      skills: this.getSkills(),
    });
    return this.skillsWindow;
  }

  onStart() {
    this.game.client.eventEmitter.on('event', (e) => {
      if (e.type === 'xp') {
        this.game.addStatusText(`+${e.args.xp}xp ${Content.getSkill(e.args.skill).name}`);

        if (this.skillsWindow) {
          this.getSkillsWindow().actions.setSkill(this.getSkill(e.args.skill));
        }
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
    const value = Player.getSkillValue(this.game.client.player, skill.id);

    return {
      ...skill,
      ...value,
      xpBar: {
        current: value.xp - Player.getXpTotalForLevel(value.earnedLevel),
        max: Player.getXpTotalForLevel(value.earnedLevel + 1) - Player.getXpTotalForLevel(value.earnedLevel),
      },
    };
  }

  getAttributes() {
    const result = [];
    for (const [name, value] of this.game.client.player.attributes) {
      result.push({ name, ...value });
    }
    return Helper.sortByPrecedence(result, [
      { type: 'predicate', fn: (item) => item.name === 'life' },
      { type: 'predicate', fn: (item) => item.name === 'mana' },
      { type: 'predicate', fn: (item) => item.name === 'stamina' },
    ]);
  }

  getSkills() {
    return Player.getLearnedSkills(this.game.client.player).map((id) => this.getSkill(id));
  }
}

export default SkillsModule;
