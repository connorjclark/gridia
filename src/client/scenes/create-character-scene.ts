import * as Content from '../../content.js';
import {ATTRIBUTES} from '../../player.js';
import * as CommandBuilder from '../../protocol/command-builder.js';
import * as Helper from '../helper.js';

import {SceneController} from './scene-controller.js';
import {Scene} from './scene.js';

export class CreateCharacterScene extends Scene {
  private createBtn: HTMLElement;
  private nameInput: HTMLInputElement;
  private attributeEls: Record<string, HTMLInputElement> = {};
  private selectedSkills = new Set<number>();

  constructor(private controller: SceneController) {
    super(Helper.find('.create-character'));
    this.createBtn = Helper.find('.create-btn', this.element);
    this.nameInput = Helper.find('#create--name', this.element) as HTMLInputElement;
    this.onClickCreateBtn = this.onClickCreateBtn.bind(this);

    this.nameInput.placeholder = '<enter player name>';
    this.nameInput.value = '';

    const {characterCreation} = Content.getWorldDataDefinition();

    if (characterCreation.simple) {
      Helper.find('.create--skills-and-attributes').hidden = true;
    }

    let attributePoints = characterCreation.attributePoints;
    const updateAttributes = () => {
      attributePoints = characterCreation.attributePoints;
      for (const attribute of Object.values(this.attributeEls)) {
        attributePoints -= attribute.valueAsNumber;
      }

      Helper.find('.create--attribute-points', this.element).textContent = attributePoints.toLocaleString();

      if (!characterCreation.simple) {
        this.createBtn.classList.toggle('red', attributePoints !== 0);
      }
    };

    const attributesSorted = Helper.sortByPrecedence([...ATTRIBUTES], [
      {type: 'equal', value: 'life'},
      {type: 'equal', value: 'mana'},
      {type: 'equal', value: 'stamina'},
    ]);

    const attributesEl = Helper.find('.create--attributes', this.element);
    attributesEl.textContent = '';
    for (const attribute of attributesSorted) {
      const el = Helper.createChildOf(attributesEl, 'div', 'create--attribute');
      const el2 = Helper.createChildOf(el, 'div');
      Helper.createChildOf(el2, 'div').textContent = attribute;
      this.attributeEls[attribute] = Helper.createChildOf(el2, 'input', '', {
        type: 'range',
        value: '100',
        min: '10',
        max: '200',
      });
      const valueEl = Helper.createChildOf(el, 'div');
      valueEl.textContent = this.attributeEls[attribute].value;
      this.attributeEls[attribute].addEventListener('input', () => {
        updateAttributes();
        if (attributePoints < 0) {
          this.attributeEls[attribute].valueAsNumber += attributePoints;
          updateAttributes();
        }

        valueEl.textContent = this.attributeEls[attribute].value;
      });
    }

    const skillsByCategory = Helper.sortByPrecedence([...Content.getSkillsGroupedByCategory().entries()], [
      {type: 'predicate', fn: (kv) => kv[0] === 'combat basics'},
      {type: 'predicate', fn: (kv) => kv[0] === 'combat'},
      {type: 'predicate', fn: (kv) => kv[0] === 'magic'},
      {type: 'predicate', fn: (kv) => kv[0] === 'crafts'},
    ]);
    const requiredSkills = characterCreation.requiredSkills || [];

    const skillsEl = Helper.find('.create--skills', this.element);
    skillsEl.textContent = '';
    for (const [category, skills] of skillsByCategory) {
      const categoryEl = Helper.createChildOf(skillsEl, 'div', 'create--skill-category');
      Helper.createChildOf(categoryEl, 'h3').textContent = category;
      for (const skill of skills) {
        const el = Helper.createChildOf(categoryEl, 'div', 'create--skill flex tooltip-on-hover');
        Helper.createChildOf(el, 'div').textContent = `${skill.name} (${skill.skillPoints})`;
        const required = requiredSkills.includes(skill.id);

        let tooltip = skill.description + '<br> base level = ' + Content.getSkillAttributeDescription(skill);
        if (required) {
          el.classList.add('selected');
          tooltip += '<br>Required';
        }
        Helper.createChildOf(categoryEl, 'div', 'tooltip').innerHTML = tooltip;

        if (required) continue;
        el.addEventListener('click', () => {
          let selected = this.selectedSkills.has(skill.id);
          if (selected) {
            this.selectedSkills.delete(skill.id);
            selected = false;
          } else if (skillPoints >= skill.skillPoints) {
            this.selectedSkills.add(skill.id);
            selected = true;
          }
          el.classList.toggle('selected', selected);
          updateSkillPoints();
        });
      }
    }

    let skillPoints = characterCreation.skillPoints;
    const updateSkillPoints = () => {
      skillPoints = characterCreation.skillPoints;
      for (const id of this.selectedSkills) {
        skillPoints -= Content.getSkill(id).skillPoints;
      }

      Helper.find('.create--skill-points', this.element).textContent = skillPoints.toLocaleString();
    };

    for (const id of requiredSkills) {
      this.selectedSkills.add(id);
      for (const el of Helper.findAll('.create--skill.selected')) {
        el.classList.add('required');
      }
    }

    updateAttributes();
    updateSkillPoints();
  }

  async onClickCreateBtn() {
    const name = this.nameInput.value;

    const attributes = new Map<string, number>();
    for (const [attribute, el] of Object.entries(this.attributeEls)) {
      attributes.set(attribute, el.valueAsNumber);
    }

    try {
      await this.controller.client.connection.sendCommand(CommandBuilder.createPlayer({
        name,
        attributes,
        skills: this.selectedSkills,
      }));
      this.controller.startGame();
    } catch (error: any) {
      Helper.find('.create--errorlog', this.element).textContent = error;
    }
  }

  onShow() {
    super.onShow();
    this.createBtn.addEventListener('click', this.onClickCreateBtn);
  }

  onHide() {
    super.onHide();
    this.createBtn.removeEventListener('click', this.onClickCreateBtn);
  }
}
