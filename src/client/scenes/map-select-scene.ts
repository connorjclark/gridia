import * as Helper from '../helper';

type InputData = Record<string, string | number | boolean>;
interface InputFormData {
  [name: string]: InputData;
}
interface RootInputFormData {
  [name: string]: Array<{ name: string; data: InputFormData; }> | InputData;
}

const squareInputFormData: InputFormData = {
  size: {
    type: 'number',
    min: 1,
    value: 15,
    max: 100,
  },
  rand: {
    type: 'number',
    min: 0,
    value: 0.1,
    max: 1,
    step: 0.1,
  },
};

const voronoiInputFormData: InputFormData = {
  points: {
    type: 'number',
    min: 1,
    value: 500,
    max: 5000,
    step: 1,
  },
  relaxations: {
    type: 'number',
    min: 0,
    value: 3,
    max: 100,
    step: 1,
  },
};

const perlinInputFormData: InputFormData = {
  percentage: {
    type: 'number',
    min: 0,
    value: 0.2,
    max: 1,
    step: 0.1,
  },
};

const radialInputFormData: InputFormData = {
  radius: {
    type: 'number',
    min: 0,
    value: 0.9,
    max: 1,
    step: 0.1,
  },
};

const inputFormData: RootInputFormData = {
  width: {
    type: 'number',
    min: 100,
    value: 200,
    max: 500,
    step: 20,
  },
  height: {
    type: 'number',
    min: 100,
    value: 200,
    max: 500,
    step: 20,
  },
  depth: {
    type: 'number',
    min: 1,
    value: 2,
    max: 5,
  },
  partitionStrategy: [
    {
      name: 'voronoi',
      data: voronoiInputFormData,
    },
    {
      name: 'square',
      data: squareInputFormData,
    },
  ],
  waterStrategy: [
    {
      name: 'perlin',
      data: perlinInputFormData,
    },
    {
      name: 'radial',
      data: radialInputFormData,
    },
  ],
  borderIsAlwaysWater: {
    type: 'checkbox',
    value: false,
  },
};

export function createMapSelectForm(inputFormEl: HTMLElement) {
  const createInput = (name: string, data: InputData, parent: Element, group?: string) => {
    const inputEl = document.createElement('input');
    inputEl.classList.add(`generate--${name}-input`);
    inputEl.setAttribute('name', name);
    // @ts-ignore
    inputEl.setAttribute('type', data.type);
    inputEl.setAttribute('id', group ? `${group}-${name}` : name);
    for (const [key, value] of Object.entries(data)) {
      if (key === 'checked' && typeof value === 'boolean') {
        inputEl.checked = value;
      } else {
        inputEl.setAttribute(key, String(value));
      }
    }

    const labelEl = document.createElement('label');
    labelEl.append(document.createTextNode(name[0].toUpperCase() + name.substr(1)));
    labelEl.append(inputEl);

    parent.append(labelEl);

    return inputEl;
  };

  const createSubForm = (group: string, groupEl: HTMLElement, formData: InputFormData, type: string) => {
    const subFormEl = document.createElement('div');
    subFormEl.classList.add('generate--sub-form');
    subFormEl.setAttribute('data-name', type);
    subFormEl.classList.add('hidden');
    groupEl.append(subFormEl);

    for (const [name, data] of Object.entries(formData)) {
      createInput(name, data, subFormEl, group);
    }
  };

  const showSubForm = (groupEl: HTMLElement, name: string) => {
    for (const subFormEl of Helper.findAll(`.generate--sub-form`, groupEl)) {
      if (subFormEl.getAttribute('data-name') === name) {
        subFormEl.classList.remove('hidden');
      } else {
        subFormEl.classList.add('hidden');
      }
    }
  };

  inputFormEl.innerHTML = '';
  for (const [name, data] of Object.entries(inputFormData)) {
    if (Array.isArray(data)) {
      const group = name;
      const groupEl = document.createElement('div');
      groupEl.append(document.createTextNode(`${group}: `));
      inputFormEl.append(groupEl);
      groupEl.classList.add(`generate--${group}-group`);

      for (const subData of data) {
        const checked = data.indexOf(subData) === 0;
        createInput(subData.name, { type: 'radio', name: group, value: subData.name, checked }, groupEl)
          .addEventListener('change', (e) => {
            if (e.srcElement instanceof HTMLInputElement) showSubForm(groupEl, e.srcElement.value);
          });
      }

      for (const subData of data) {
        createSubForm(group, groupEl, subData.data, subData.name);
      }

      showSubForm(groupEl, data[0].name);
    } else {
      createInput(name, data, inputFormEl);
    }
  }
}

export function getMapGenOpts(inputFormEl: HTMLElement) {
  const opts: Record<string, number | string | object> = {};

  const set = (obj: any, name: string, inputEl: HTMLInputElement) => {
    let value: number | string | boolean = inputEl.value;
    if (inputEl.type === 'number') value = Number(inputEl.value);
    else if (inputEl.type === 'checkbox') value = inputEl.checked;
    else value = inputEl.value;
    obj[name] = value;
  };

  for (const [name, data] of Object.entries(inputFormData)) {
    if (Array.isArray(data)) {
      const activeName =
        Helper.find(`.generate--${name}-group .generate--sub-form:not(.hidden)`).getAttribute('data-name');
      const activeData = data.find((d) => d.name === activeName);
      if (!activeData) throw new Error();

      opts[name] = {
        type: activeName,
      };

      for (const name2 of Object.keys(activeData.data)) {
        set(opts[name], name2, Helper.find('#' + `${name}-${name2}`, inputFormEl) as HTMLInputElement);
      }
    } else {
      set(opts, name, Helper.find('#' + name, inputFormEl) as HTMLInputElement);
    }
  }

  return opts;
}
