import {h, render} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';

import * as Content from '../../../content.js';
import {ATTRIBUTES} from '../../../player.js';
import * as CommandBuilder from '../../../protocol/command-builder.js';
import * as Utils from '../../../utils.js';
import * as Helper from '../../helper.js';
import {SceneController} from '../../scenes/scene-controller.js';
import {c} from '../ui-common.js';

const attributesSorted = Utils.sortByPrecedence([...ATTRIBUTES], [
  {type: 'equal', value: 'life'},
  {type: 'equal', value: 'mana'},
  {type: 'equal', value: 'stamina'},
]);

interface Props {
  controller: SceneController;
  characterCreationData: WorldDataDefinition['characterCreation'];
  attributes: string[];
  skills: Skill[];
}

export const CharacterCreate = (props: Props) => {
  const [errors, setErrors] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [selectedAttributes, setSelectedAttributes] = useState<Map<string, number>>(new Map());
  const [selectedSkills, setSelectedSkills] = useState<Set<number>>(new Set());

  const skillsByCategory = useMemo(() => {
    return Content.getSkillsGroupedByCategory();
  }, [props.skills]);
  const attributePointsAvailable = useMemo(() => {
    let points = props.characterCreationData.attributePoints;
    for (const value of selectedAttributes.values()) {
      points -= value;
    }
    return points;
  }, [selectedAttributes]);
  const skillPointsAvailable = useMemo(() => {
    let points = props.characterCreationData.skillPoints;
    for (const skillId of selectedSkills) {
      points -= props.skills[skillId - 1].skillPoints;
    }
    return points;
  }, [selectedSkills]);

  const updateAttr = (attribute: string, value: number) => {
    const curVal = selectedAttributes.get(attribute) || 0;
    let delta = value - curVal;
    if (delta > attributePointsAvailable) delta = attributePointsAvailable;

    const map = new Map(selectedAttributes.entries());
    map.set(attribute, curVal + delta);
    setSelectedAttributes(map);
  };
  const toggleSkill = (skillId: number) => {
    const set = new Set(selectedSkills);
    if (set.has(skillId)) {
      set.delete(skillId);
    } else if (props.skills[skillId - 1].skillPoints <= skillPointsAvailable) {
      set.add(skillId);
    }
    setSelectedSkills(set);
  };

  const setPreset = (preset: CharacterCreationPreset) => {
    const attributes = Utils.mapFromRecord(preset.attributes);
    for (const attr of props.attributes) {
      if (!attributes.has(attr)) attributes.set(attr, 10);
    }
    setSelectedAttributes(attributes);
    setSelectedSkills(new Set(preset.skills));
  };

  // Initialize values to the first preset.
  useEffect(() => {
    if (props.characterCreationData.presets?.length) {
      setPreset(props.characterCreationData.presets[0]);
    } else {
      const attributes = new Map();
      for (const attribute of attributesSorted) {
        attributes.set(attribute, 100);
      }
      setSelectedAttributes(attributes);
      setSelectedSkills(new Set());
    }
  }, []);

  async function onClickCreate() {
    try {
      await props.controller.client.connection.sendCommand(CommandBuilder.createPlayer({
        name,
        attributes: selectedAttributes,
        skills: selectedSkills,
      }));
      props.controller.startGame();
    } catch (error: any) {
      setErrors([error]);
    }
  }

  const skillCategoryElements = [];
  for (const [category, skills] of skillsByCategory) {
    const skillElements = [];
    for (const skill of skills) {
      const onClick = () => {
        if (required) return;

        toggleSkill(skill.id);
      };

      const classes = ['create__skill flex tooltip-on-hover'];
      const required = props.characterCreationData.requiredSkills?.includes(skill.id);
      if (required) {
        classes.push('required');
      } else if (selectedSkills.has(skill.id)) {
        classes.push('selected');
      }
      skillElements.push(<div>
        <div class={c(...classes)} data-skill={skill.id} onClick={onClick}>
          <div>{skill.name} ({skill.skillPoints})</div>
        </div>
        <div class="tooltip">
          <div>{skill.name}</div>
          <div>Points: {skill.skillPoints}</div>
          <div>{skill.description}</div>
          <div>base level = {Content.getSkillAttributeDescription(skill)}</div>
          {required && <div>Required</div>}
        </div>
      </div>
      );
    }

    skillCategoryElements.push(<div class="create__skill-category">
      <h3>{category}</h3>
      {skillElements}
    </div>);
  }

  let createButtonDisabled = false;
  let createButtonDisabledReason = '';
  if (!props.characterCreationData.simple) {
    if (attributePointsAvailable !== 0) {
      createButtonDisabled = true;
      createButtonDisabledReason = 'Must spend all attribute points';
    }
  }

  const skillsAndAttributesEl = !props.characterCreationData.simple &&
    <div class="create__skills-and-attributes">
      <div class={c('presets', !props.characterCreationData.presets?.length && 'hidden')}>
        <h2>Presets</h2>
        {props.characterCreationData.presets?.map((preset) => {
          return <button onClick={() => setPreset(preset)}>
            {preset.name}
          </button>;
        })}
      </div>

      <div>
        <h2 class="tooltip-on-hover">Attributes</h2>
        <div class="tooltip">
          Attributes determine the base level of skills. As you train combat
          skills, you can spend xp to increase attributes.
        </div>
        Points available: <span class="create__attribute-points">{attributePointsAvailable}</span>

        <div class="create__attributes flex flex-wrap">
          {props.attributes.map((attribute) => {
            const onInput = (e: any) => {
              updateAttr(attribute, e.target.valueAsNumber);
            };

            return <div class="create__attribute">
              <div>{attribute}: {selectedAttributes.get(attribute)}</div>
              <input
                type="range"
                value={selectedAttributes.get(attribute)}
                min={10}
                max={200}
                onInput={onInput}
              ></input>
            </div>;
          })}
        </div>
      </div>

      <div>
        <h2 class="tooltip-on-hover">Skills</h2>
        <div class="tooltip">
          Skills allow you to equip certain weapons, craft certain items, and other
          miscellaneous things. As you increase your combat level, you gain skill points
          which can be used to learn more skills. Any points you don't spend now can be used
          later.
        </div>
        Points available: <span class="create__skill-points">{skillPointsAvailable}</span>

        <div class="col-2 p1">
          <div class="create__skill required">Required</div>
          <div class="create__skill selected">Selected</div>
        </div>

        <div class='create__skills flex justify-between flex-wrap'>
          {skillCategoryElements}
        </div>
      </div>
    </div>;

  return <div>
    <div class="create__form flex flex-column">
      <div>
        <div>
          <label for="create__name">Name</label>
        </div>
        <input type="text" name="name" id="create__name" max-length="20"
          value={name} onInput={(e: any) => setName(e.target.value)}></input>
      </div>

      {skillsAndAttributesEl}

      <div class="flex justify-center">
        <button
          class={c('button--primary create-btn', createButtonDisabled && 'tooltip-on-hover')}
          disabled={createButtonDisabled}
          onClick={() => onClickCreate()}
        >Create</button>
        <div class="tooltip">{createButtonDisabledReason}</div>
      </div>

      <div class='create__errorlog'>
        {errors.map((error) => <div class="create__errorlog">{error}</div>)}
      </div>
    </div>
  </div>;
};

export function makeCharacterCreateComponent(controller: SceneController) {
  const el = Helper.createElement('div');
  render(<CharacterCreate
    controller={controller}
    attributes={attributesSorted}
    skills={Content.getSkills()}
    characterCreationData={Content.getWorldDataDefinition().characterCreation}
  />, el);
  return el;
}
