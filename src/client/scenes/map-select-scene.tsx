/* eslint-disable max-len */

import linkState from 'linkstate';
import {render, h, Component, Fragment} from 'preact';

import * as CommandBuilder from '../../protocol/command-builder';
import {randInt} from '../../utils';
import {connectToServerWorker} from '../connect-to-server';
import * as Helper from '../helper';

import {Scene} from './scene';
import {SceneController} from './scene-controller';
import {SelectCharacterScene} from './select-character-scene';

const DEFAULT_MAP_FORM_STATE = {
  width: 200,
  height: 200,
  depth: 2,
  borderIsAlwaysWater: false,
  partitionStrategy: {
    choice: 'voronoi',
    options: {
      voronoi: {
        points: 500,
        relaxations: 3,
      },
      square: {
        size: 15,
        rand: 0.1,
      },
    },
  },
  waterStrategy: {
    choice: 'perlin',
    options: {
      perlin: {
        percentage: 0.2,
      },
      radial: {
        radius: 0.9,
      },
    },
  },
  seeds: {
    partition: randInt(1, 10000),
    rivers: randInt(1, 10000),
    water: randInt(1, 10000),
  },
};

type FormState = typeof DEFAULT_MAP_FORM_STATE;

function createMapSelectForm(inputFormEl: HTMLElement, onStateUpdate: (state: FormState) => void) {
  const Input = (props: any) => {
    return <Fragment>
      <label>{props.children || props.name}</label>
      <input {...props}></input>
      {props.type === 'range' && props.value}
    </Fragment>;
  };

  // Pass `parent` so `linkState` works. Could use `this` if these components were defined inside `MapSelectForm.render`,
  // but that causes user input to be lost after every render.
  const PartitionStrategy = (({parent, choice, options}: FormState['partitionStrategy'] & { parent: Component }) => {
    const statePrefix = `partitionStrategy.options.${choice}`;

    if (choice === 'voronoi') {
      const {points, relaxations} = options[choice];
      return <div>
        <Input onInput={linkState(parent, `${statePrefix}.points`)} name="points" type={'range'} min={1} value={points} max={5000} step={50}></Input>
        <Input onInput={linkState(parent, `${statePrefix}.relaxations`)} name="relaxations" type={'range'} min={0} value={relaxations} max={10} step={1}></Input>
      </div>;
    }

    if (choice === 'square') {
      const {size, rand} = options[choice];
      return <div>
        <Input onInput={linkState(parent, `${statePrefix}.size`)} name="size" type={'range'} min={1} value={size} max={100} step={5}></Input>
        <Input onInput={linkState(parent, `${statePrefix}.rand`)} name="rand" type={'range'} min={0} value={rand} max={0.5} step={0.1}></Input>
      </div>;
    }

    throw new Error();
  });

  const WaterStrategy = (({parent, choice, options}: FormState['waterStrategy'] & { parent: Component }) => {
    const statePrefix = `waterStrategy.options.${choice}`;

    if (choice === 'perlin') {
      const {percentage} = options[choice];
      return <div>
        <Input onInput={linkState(parent, `${statePrefix}.percentage`)} name="percentage" type={'range'} min={0} value={percentage} max={1} step={0.1}></Input>
      </div>;
    }

    if (choice === 'radial') {
      const {radius} = options[choice];
      return <div>
        <Input onInput={linkState(parent, `${statePrefix}.radius`)} name="radius" type={'range'} min={0} value={radius} max={1} step={0.1}></Input>
      </div>;
    }

    throw new Error();
  });

  class MapSelectForm extends Component<any, FormState> {
    state = DEFAULT_MAP_FORM_STATE;

    componentDidMount() {
      this.props.onUpdate(stateToMapGenOptions(this.state));
    }

    componentDidUpdate(props: any) {
      props.onUpdate(stateToMapGenOptions(this.state));
    }

    render(props: any, state: FormState) {


      return <div>
        <div>
          <Input onInput={linkState(this, 'width')} name="width" type={'range'} min={100} value={state.width} max={1000} step={20}></Input>
          <Input onChange={linkState(this, 'height')} name="height" type={'range'} min={100} value={state.height} max={1000} step={20}></Input>
          <Input onChange={linkState(this, 'depth')} name="depth" type={'range'} min={1} value={state.depth} max={5} step={1}></Input>
        </div>
        <div>
          <Input onChange={linkState(this, 'borderIsAlwaysWater')} name="borderIsAlwaysWater" type={'checkbox'} value={state.borderIsAlwaysWater}>Border Is Always Water</Input>
        </div>

        <div>
          <label for="partitionStrategy">Partition Strategy</label>
          <Input onInput={linkState(this, 'partitionStrategy.choice', 'target.value')} type={'radio'} name="partitionStrategy" value={'voronoi'} checked={state.partitionStrategy.choice === 'voronoi'}>Voronoi</Input>
          <Input onInput={linkState(this, 'partitionStrategy.choice', 'target.value')} type={'radio'} name="partitionStrategy" value={'square'} checked={state.partitionStrategy.choice === 'square'}>Square</Input>
          <PartitionStrategy parent={this} {...state.partitionStrategy}></PartitionStrategy>
        </div>

        <div>
          <label for="waterStrategy">Water Strategy</label>
          <Input onInput={linkState(this, 'waterStrategy.choice', 'target.value')} type={'radio'} name="waterStrategy" value={'perlin'} checked={state.waterStrategy.choice === 'perlin'}>Perlin</Input>
          <Input onInput={linkState(this, 'waterStrategy.choice', 'target.value')} type={'radio'} name="waterStrategy" value={'radial'} checked={state.waterStrategy.choice === 'radial'}>Radial</Input>
          <WaterStrategy parent={this} {...state.waterStrategy}></WaterStrategy>
        </div>

        {Object.entries(state.seeds).map(([name, value]) => {
          const key = `seeds.${name}`;
          return <div>
            <Input onInput={linkState(this, key)} name={key} type={'number'} value={value}></Input>
          </div>;
        })}
      </div>;
    }
  }

  render(<MapSelectForm onUpdate={onStateUpdate}></MapSelectForm>, inputFormEl);
}

function stateToMapGenOptions(data: any) {
  const options = {} as any;

  function handle(src: any, dest: any) {
    for (const [key, value] of Object.entries(src)) {
      if (value && typeof value === 'object' && key !== 'seeds') {
        // @ts-ignore
        dest[key] = {type: value.choice};
        // @ts-ignore
        handle(value.options[value.choice], dest[key]);
      } else {
        // coerce to number, because linkState saves number values as strings.
        dest[key] = Number.isNaN(Number(value)) ? value : Number(value);
      }
    }
  }
  handle(data, options);

  return options;
}

export class MapSelectScene extends Scene {
  private mapListEl: HTMLElement;
  private selectBtn: HTMLElement;
  private previewEl: HTMLElement;
  private inputFormEl: HTMLElement;
  private loadingPreview = false;

  constructor(private controller: SceneController) {
    super(Helper.find('.map-select'));
    this.mapListEl = Helper.find('.map-list');
    this.selectBtn = Helper.find('.generate--select-btn', this.element);
    this.previewEl = Helper.find('.generate--preview', this.element);
    this.inputFormEl = Helper.find('.generate--input-form', this.element);
    this.generateMap = this.generateMap.bind(this);
    this.onClickSelectBtn = this.onClickSelectBtn.bind(this);
    this.onSelectMap = this.onSelectMap.bind(this);
  }

  async loadMap(name: string) {
    this.controller.client = await connectToServerWorker(this.controller.serverWorker, {
      mapName: name,
      dummyDelay: this.controller.qs.latency ?? 0,
      verbose: false,
    });

    // TODO: this should be part of the `connectToX` flow ...
    await new Promise<void>((resolve) => {
      this.controller.client.eventEmitter.addListener('event', (e) => {
        if (e.type === 'connect') resolve();
      });
    });

    this.controller.loadLocalStorageData(`worker-${name}`);
    await this.loadSelectCharacterScene();
  }

  async renderMapSelection() {
    this.mapListEl.innerHTML = '';

    const mapNames = await this.controller.getMapNames();
    for (const name of mapNames) {
      const mapEl = document.createElement('li');
      mapEl.classList.add('map-list--item');
      mapEl.setAttribute('data-name', name);
      mapEl.innerText = name;
      this.mapListEl.append(mapEl);
    }
  }

  async generateMap(opts: any) {
    if (this.loadingPreview) return;
    this.loadingPreview = true;

    const canvas = document.createElement('canvas');
    const offscreenCanvas = canvas.transferControlToOffscreen && canvas.transferControlToOffscreen();
    await this.controller.serverWorker.generateMap({
      ...opts,
      canvas: offscreenCanvas,
      bare: true,
    }).finally(() => this.loadingPreview = false);

    this.previewEl.innerHTML = '';
    this.previewEl.append(canvas);
    this.selectBtn.classList.remove('hidden');
  }

  async onClickSelectBtn() {
    const name = `default-world-${this.mapListEl.childElementCount}`;
    await this.controller.serverWorker.saveGeneratedMap({name});
    this.controller.loadLocalStorageData(`worker-${name}`);
    this.controller.client = await connectToServerWorker(this.controller.serverWorker, {
      mapName: name,
      dummyDelay: this.controller.qs.latency ?? 0,
      verbose: false,
    });
    await this.loadSelectCharacterScene();
  }

  async loadSelectCharacterScene() {
    const loginData = await this.controller.client.connection.sendCommand(CommandBuilder.login({
      firebaseToken: 'local',
    }));
    this.controller.pushScene(new SelectCharacterScene(this.controller, loginData));
  }

  onSelectMap(e: Event) {
    // TODO: this is annoying.
    if (!(e.target instanceof HTMLElement)) return;

    const name = e.target.getAttribute('data-name') || '';
    this.loadMap(name);
  }

  onShow() {
    super.onShow();
    this.selectBtn.addEventListener('click', this.onClickSelectBtn);
    this.mapListEl.addEventListener('click', this.onSelectMap);
    this.loadingPreview = false;
    this.previewEl.innerHTML = '';
    this.selectBtn.classList.add('hidden');
    this.renderMapSelection();
    createMapSelectForm(this.inputFormEl, this.generateMap.bind(this));
  }

  onHide() {
    super.onHide();
    this.selectBtn.removeEventListener('click', this.onClickSelectBtn);
    this.mapListEl.removeEventListener('click', this.onSelectMap);
  }

  onDestroy() {
    super.onDestroy();
    this.controller.destoryWorker();
  }
}
