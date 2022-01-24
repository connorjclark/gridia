import {h, render} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';

import * as Content from '../../../content.js';
import * as CommandBuilder from '../../../protocol/command-builder.js';
import * as Utils from '../../../utils.js';
import * as Helper from '../../helper.js';
import {SceneController} from '../../scenes/scene-controller.js';
import {c} from '../ui-common.js';

interface Props {
  controller: SceneController;
  characterCreationData: WorldDataDefinition['characterCreation'];
  skills: Skill[];
}

export const CharacterCreate = (props: Props) => {
  const [errors, setErrors] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [selectedAttributes, setSelectedAttributes] = useState(new Map<string, number>());
  const [selectedSkills, setSelectedSkills] = useState(new Map<number, 'learn' | 'specialize'>());

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
    for (const [skillId, state] of selectedSkills) {
      if (state === 'specialize') {
        points -= 2 * props.skills[skillId - 1].skillPoints;
      } else {
        points -= props.skills[skillId - 1].skillPoints;
      }
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
    const map = new Map(selectedSkills);
    const states = ['learn', 'specialize', 'none'] as const;
    const index = states.indexOf(map.get(skillId) || 'none');
    const nextState = states[(index + 1) % states.length];
    const canAfford = props.skills[skillId - 1].skillPoints <= skillPointsAvailable;

    if (nextState === 'none') {
      map.delete(skillId);
    } else if (canAfford) {
      map.set(skillId, nextState);
    } else {
      map.delete(skillId);
    }

    setSelectedSkills(map);
  };

  const setPreset = (preset: CharacterCreationPreset) => {
    const attributes = Utils.mapFromRecord(preset.attributes);
    for (const attribute of props.characterCreationData.attributes) {
      if (attribute.derived) continue;

      if (!attributes.has(attribute.name)) attributes.set(attribute.name, 10);
    }
    setSelectedAttributes(attributes);

    const skills = new Map<number, 'learn' | 'specialize'>();
    preset.skills.forEach((s) => skills.set(s, 'learn'));
    preset.specializedSkills.forEach((s) => skills.set(s, 'specialize'));
    setSelectedSkills(skills);
  };

  // Initialize values to the first preset.
  useEffect(() => {
    if (props.characterCreationData.presets?.length) {
      setPreset(props.characterCreationData.presets[0]);
    } else {
      const attributes = new Map();
      for (const attribute of props.characterCreationData.attributes) {
        if (attribute.derived) continue;

        attributes.set(attribute.name, 10);
      }
      setSelectedAttributes(attributes);
      setSelectedSkills(new Map());
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
      } else if (selectedSkills.get(skill.id) === 'specialize') {
        classes.push('specialized');
      } else if (selectedSkills.get(skill.id) === 'learn') {
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

        <div class="create__attributes">
          {props.characterCreationData.attributes.map((attribute) => {
            const onInput = (e: any) => {
              updateAttr(attribute.name, e.target.valueAsNumber);
            };

            let value;
            if (attribute.derived) {
              const multiplier = attribute.derived.creationMultiplier || 1;
              value = multiplier * (selectedAttributes.get(attribute.derived.from) || 0);
            } else {
              value = selectedAttributes.get(attribute.name) || 0;
            }

            return <div class="create__attribute">
              <div>{attribute.name}: {value}</div>
              <input
                type="range"
                disabled={!!attribute.derived}
                value={value}
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

        <div class="col-3 p1">
          <div class="create__skill selected">Selected</div>
          <div class="create__skill specialized">Specialized (2x xp rate)</div>
          <div class="create__skill required">Required</div>
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
    skills={Content.getSkills()}
    characterCreationData={Content.getWorldDataDefinition().characterCreation}
  />, el);
  return el;
}
