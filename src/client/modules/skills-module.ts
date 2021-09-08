import * as Content from '../../content';
import * as Player from '../../player';
import * as CommandBuilder from '../../protocol/command-builder';
import {ClientModule} from '../client-module';
import * as Helper from '../helper';
import {State, makeSkillsWindow} from '../ui/skills-window';

export class SkillsModule extends ClientModule {
  protected skillsWindow?: ReturnType<typeof makeSkillsWindow>;

  makeUIState(): State {
    return {
      combatLevel: this.getCombatLevel(),
      attributes: this.getAttributes(),
      skills: this.getSkills(),
      skillPoints: this.game.client.player.skillPoints,
      unlearnedSkills: Player.getUnlearnedSkills(this.game.client.player),
      onLearnSkill: (id) => {
        this.game.client.connection.sendCommand(CommandBuilder.learnSkill({id}));
      },
    };
  }

  getSkillsWindow() {
    if (this.skillsWindow) return this.skillsWindow;

    this.skillsWindow = makeSkillsWindow(this.makeUIState());
    return this.skillsWindow;
  }

  onStart() {
    this.game.client.eventEmitter.on('event', (e) => {
      if (e.type === 'xp') {
        this.game.addStatusText(`+${e.args.xp}xp ${Content.getSkill(e.args.skill).name}`);

        if (this.skillsWindow) {
          this.skillsWindow.actions.setCombatLevel(this.getCombatLevel());
          this.skillsWindow.actions.setSkill(this.getSkill(e.args.skill));
        }
      }

      if (e.type === 'setCreature' && e.args.buffs && e.args.id === this.game.client.creatureId) {
        if (this.skillsWindow) {
          this.skillsWindow.actions.setCombatLevel(this.getCombatLevel());
          this.skillsWindow.actions.setSkills(this.getSkills());
        }
      }

      if (this.skillsWindow && e.type === 'initialize') {
        this.getSkillsWindow().actions.setState(this.makeUIState());
      }
    });

    this.game.client.eventEmitter.on('panelFocusChanged', ({panelName}) => {
      if (panelName === 'skills') {
        this.getSkillsWindow().el.hidden = false;
        this.getSkillsWindow().actions.setSkills(this.getSkills());
      } else if (this.skillsWindow) {
        this.getSkillsWindow().el.hidden = true;
      }
    });
  }

  getCombatLevel() {
    const combatLevelDetails = Player.getCombatLevel(this.game.client.player);
    const level = combatLevelDetails.combatLevel;
    return {
      level,
      xpBar: {
        current: combatLevelDetails.xp - Player.getXpTotalForCombatLevel(level),
        max: Player.getXpTotalForCombatLevel(level + 1) - Player.getXpTotalForCombatLevel(level),
      },
    };
  }

  getSkill(id: number) {
    const skill = Content.getSkill(id);
    const value = Player.getSkillValue(this.game.client.player, this.game.client.creature.buffs, skill.id);

    return {
      ...skill,
      ...value,
      xpBar: {
        current: value.xp - Player.getXpTotalForLevel(value.earnedLevel),
        max: Player.getXpTotalForLevel(value.earnedLevel + 1) - Player.getXpTotalForLevel(value.earnedLevel),
      },
      baseLevelFormula: Content.getSkillAttributeDescription(skill),
    };
  }

  getAttributes() {
    const result = [];
    for (const [name, value] of this.game.client.player.attributes) {
      result.push({name, ...value});
    }
    return Helper.sortByPrecedence(result, [
      {type: 'predicate', fn: (item) => item.name === 'life'},
      {type: 'predicate', fn: (item) => item.name === 'mana'},
      {type: 'predicate', fn: (item) => item.name === 'stamina'},
    ]);
  }

  getSkills() {
    return Player.getLearnedSkills(this.game.client.player).map((id) => this.getSkill(id));
  }
}
