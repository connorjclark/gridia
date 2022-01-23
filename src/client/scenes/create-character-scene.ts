import * as Content from '../../content.js';
import {ATTRIBUTES} from '../../player.js';
import * as CommandBuilder from '../../protocol/command-builder.js';
import * as Utils from '../../utils.js';
import * as Helper from '../helper.js';

import {SceneController} from './scene-controller.js';
import {Scene} from './scene.js';

const attributesSorted = Utils.sortByPrecedence([...ATTRIBUTES], [
  {type: 'equal', value: 'life'},
  {type: 'equal', value: 'mana'},
  {type: 'equal', value: 'stamina'},
]);

export class CreateCharacterScene extends Scene {
  private createBtn: HTMLElement;
  private nameInput: HTMLInputElement;
  private attributeEls: Record<string, HTMLElement> = {};
  private attributes = new Map<string, number>();
  private selectedSkills = new Set<number>();

  constructor(private controller: SceneController) {
    super(Helper.find('.create-character'));
    this.createBtn = Helper.find('.create-btn', this.element);
    this.nameInput = Helper.find('#create--name', this.element) as HTMLInputElement;
    this.onClickCreateBtn = this.onClickCreateBtn.bind(this);

    const setDefaultValues = () => {
      if (characterCreation.presets?.length) {
        setPresetValues(characterCreation.presets[0]);
      } else {
        this.selectedSkills = new Set();
        this.attributes = new Map();
        for (const attribute of attributesSorted) {
          this.attributes.set(attribute, 100);
        }
      }
    };
    const setPresetValues = (preset: CharacterCreationPreset) => {
      this.attributes = Utils.mapFromRecord(preset.attributes);
      this.selectedSkills = new Set(preset.skills);
    };

    this.nameInput.placeholder = '<enter player name>';
    this.nameInput.value = '';

    const {characterCreation} = Content.getWorldDataDefinition();

    if (characterCreation.simple) {
      Helper.find('.create--skills-and-attributes').hidden = true;
    }

    let attributePoints = characterCreation.attributePoints;
    const updateAttributes = () => {
      attributePoints = characterCreation.attributePoints;
      for (const [attribute, attributeEl] of Object.entries(this.attributeEls)) {
        const inputEl = Helper.find('input', attributeEl) as HTMLInputElement;
        const valueEl = Helper.find('.create--attribute__value', attributeEl);
        inputEl.valueAsNumber = this.attributes.get(attribute) || 0;
        valueEl.textContent = String(inputEl.valueAsNumber);

        attributePoints -= inputEl.valueAsNumber;
      }

      Helper.find('.create--attribute-points', this.element).textContent = attributePoints.toLocaleString();

      if (!characterCreation.simple) {
        this.createBtn.classList.toggle('red', attributePoints !== 0);
      }
    };

    const attributesEl = Helper.find('.create--attributes', this.element);
    attributesEl.textContent = '';
    for (const attribute of attributesSorted) {
      const el = Helper.createChildOf(attributesEl, 'div', 'create--attribute');
      const el2 = Helper.createChildOf(el, 'div');
      Helper.createChildOf(el2, 'div').textContent = attribute;

      const inputEl = Helper.createChildOf(el2, 'input', '', {
        type: 'range',
        value: '100',
        min: '10',
        max: '200',
      });
      Helper.createChildOf(el, 'div', 'create--attribute__value');
      this.attributeEls[attribute] = el;

      this.attributeEls[attribute].addEventListener('input', () => {
        const currentVal = (this.attributes.get(attribute) || 0);
        let delta = inputEl.valueAsNumber - currentVal;
        delta = Math.min(delta, attributePoints);
        this.attributes.set(attribute, currentVal + delta);
        updateAttributes();
      });
    }

    const skillsByCategory = Content.getSkillsGroupedByCategory();
    const requiredSkills = characterCreation.requiredSkills || [];

    const skillsEl = Helper.find('.create--skills', this.element);
    skillsEl.textContent = '';
    for (const [category, skills] of skillsByCategory) {
      const categoryEl = Helper.createChildOf(skillsEl, 'div', 'create--skill-category');
      Helper.createChildOf(categoryEl, 'h3').textContent = category;
      for (const skill of skills) {
        const el = Helper.createChildOf(categoryEl, 'div', 'create--skill flex tooltip-on-hover');
        el.setAttribute('data-skill', String(skill.id));
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
          if (this.selectedSkills.has(skill.id)) {
            this.selectedSkills.delete(skill.id);
          } else if (skillPoints >= skill.skillPoints) {
            this.selectedSkills.add(skill.id);
          }

          updateSkillPoints();
        });
      }
    }

    if (characterCreation.presets?.length) {
      for (const preset of characterCreation.presets || []) {
        const el = Helper.createChildOf(Helper.find('.presets'), 'button');
        el.textContent = preset.name;
        el.addEventListener('click', () => {
          setPresetValues(preset);
          updateAttributes();
          updateSkillPoints();
        });
      }
    } else {
      Helper.find('.presets').classList.add('hidden');
    }

    let skillPoints = characterCreation.skillPoints;
    const updateSkillPoints = () => {
      skillPoints = characterCreation.skillPoints;
      for (const id of this.selectedSkills) {
        skillPoints -= Content.getSkill(id).skillPoints;
      }

      Helper.find('.create--skill-points', this.element).textContent = skillPoints.toLocaleString();

      for (const skillEl of Helper.findAll('.create--skill')) {
        const skillId = Number(skillEl.getAttribute('data-skill'));
        skillEl.classList.toggle('required', requiredSkills.includes(skillId));
        skillEl.classList.toggle('selected', this.selectedSkills.has(skillId));
      }
    };

    setDefaultValues();
    updateAttributes();
    updateSkillPoints();
  }

  async onClickCreateBtn() {
    const name = this.nameInput.value;
    try {
      await this.controller.client.connection.sendCommand(CommandBuilder.createPlayer({
        name,
        attributes: this.attributes,
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
