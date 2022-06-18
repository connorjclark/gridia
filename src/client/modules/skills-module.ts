import * as Content from '../../content.js';
import * as Player from '../../player.js';
import * as CommandBuilder from '../../protocol/command-builder.js';
import * as Utils from '../../utils.js';
import {ClientModule} from '../client-module.js';
import {State, makeSkillsWindow} from '../ui/windows/skills-window.js';

export class SkillsModule extends ClientModule {
  protected skillsWindow?: ReturnType<typeof makeSkillsWindow>;

  makeUIState(): State {
    return {
      combatLevel: this.getCombatLevel(),
      attributes: this.getAttributes(),
      skills: this.getSkills(),
      skillPoints: this.game.client.player.skillPoints,
      spendableXp: Player.getSpendableXp(this.game.client.player),
      unlearnedSkills: Player.getUnlearnedSkills(this.game.client.player)
        .sort((a,b) => a.name.localeCompare(b.name)),
      onLearnSkill: async (id) => {
        await this.game.client.connection.sendCommand(CommandBuilder.learnSkill({id}));
        this.game.modules.notifications.addNotification({
          details: {
            type: 'text',
            title: 'New Skill',
            text: `You learned ${Content.getSkill(id).name}!`,
          },
        });
      },
      onIncrementAttribute: (name) => {
        this.game.client.connection.sendCommand(CommandBuilder.incrementAttribute({name}));
      },
    };
  }

  getSkillsWindow() {
    if (this.skillsWindow) return this.skillsWindow;

    this.skillsWindow = makeSkillsWindow(this.game, this.makeUIState());
    return this.skillsWindow;
  }

  onStart() {
    this.game.client.eventEmitter.on('event', (e) => {
      if (e.type === 'xp') {
        Player.incrementSkillXp(this.game.client.player, e.args.skill, e.args.xp);
        this.game.addStatusText(`+${e.args.xp}xp ${Content.getSkill(e.args.skill).name}`);

        if (this.skillsWindow) {
          this.skillsWindow.actions.setCombatLevel(this.getCombatLevel());
          this.skillsWindow.actions.setSkill(this.getSkill(e.args.skill));
          this.skillsWindow.actions.setSpendableXp(Player.getSpendableXp(this.game.client.player));
        }
      }

      if (e.type === 'setCreature' && e.args.buffs && e.args.id === this.game.client.session.creatureId) {
        if (this.skillsWindow) {
          this.skillsWindow.actions.setCombatLevel(this.getCombatLevel());
          this.skillsWindow.actions.setSkills(this.getSkills());
        }
      }

      if (this.skillsWindow && e.type === 'initialize') {
        this.getSkillsWindow().actions.setState(this.makeUIState());
      }
    });

    this.getSkillsWindow();
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
    const summary = Player.getSkillSummary(this.game.client.player, this.game.client.creature.buffs, skill.id);

    return {
      ...skill,
      ...summary,
      learned: this.game.client.player.skills.has(id),
      specialized: this.game.client.player.specializedSkills.has(id),
      xpBar: {
        current: summary.xp - Player.getXpTotalForLevel(summary.earnedLevel),
        max: Player.getXpTotalForLevel(summary.earnedLevel + 1) - Player.getXpTotalForLevel(summary.earnedLevel),
      },
      baseLevelFormula: Content.getSkillAttributeDescription(skill),
    };
  }

  getAttributes() {
    const result = [];
    for (const name of this.game.client.player.attributes.keys()) {
      result.push({name, ...Player.getAttributeValue(this.game.client.player, name, [])});
    }
    return Utils.sortByPrecedence(result, [
      {type: 'predicate', fn: (item) => item.name === 'life'},
      {type: 'predicate', fn: (item) => item.name === 'mana'},
      {type: 'predicate', fn: (item) => item.name === 'stamina'},
    ]);
  }

  getSkills() {
    return [...Content.getSkillsGroupedByCategory().values()]
      .flat()
      .map((skill) => this.getSkill(skill.id));
  }
}
