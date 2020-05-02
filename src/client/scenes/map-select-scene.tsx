import { render, h, Component, Fragment } from 'preact';
import linkState from 'linkstate';

export const DEFAULT_MAP_FORM_STATE = {
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
  seeds: {} as { [type: string]: number },
};

type FormState = typeof DEFAULT_MAP_FORM_STATE;

export function createMapSelectForm(inputFormEl: HTMLElement, state: FormState, onStateUpdate: (state: FormState) => void) {
  const Input = (props: any) => {
    return <span class='input-group'>
      <label>{props.children || props.name}</label>
      <input {...props}></input>
      {props.type === 'range' && props.value}
    </span>
  };

  class MapSelectForm extends Component<any, FormState> {
    state = state // oh god.

    componentWillUpdate(props: any, state: FormState) {
      props.onUpdate(state);
    }

    render(props: any, state: FormState) {
      const PartitionStrategy = (({ choice, options }: FormState['partitionStrategy']) => {
        if (choice === 'voronoi') {
          const { points, relaxations } = options[choice];
          return <div>
            <Input onInput={linkState(this, 'partitionStrategy.options.voronoi.points')} name="points" type={'number'} min={1} value={points} max={5000} step={50}></Input>
            <Input onInput={linkState(this, 'partitionStrategy.options.voronoi.relaxations')} name="relaxations" type={'number'} min={0} value={relaxations} max={100} step={1}></Input>
          </div>
        }

        if (choice === 'square') {
          const { size, rand } = options[choice];
          return <div>
            <Input onInput={linkState(this, 'partitionStrategy.options.square.size')} name="size" type={'number'} min={1} value={size} max={100} step={5}></Input>
            <Input onInput={linkState(this, 'partitionStrategy.options.square.rand')} name="rand" type={'number'} min={0} value={rand} max={1} step={0.1}></Input>
          </div>
        }

        throw new Error();
      });

      const WaterStrategy = (({ choice, options }: FormState['waterStrategy']) => {
        if (choice === 'perlin') {
          const { percentage } = options[choice];
          return <div>
            <Input onInput={linkState(this, 'partitionStrategy.options.voronoi.percentage')} name="percentage" type={'number'} min={0} value={percentage} max={1} step={0.1}></Input>
          </div>
        }

        if (choice === 'radial') {
          const { radius } = options[choice];
          return <div>
            <Input onInput={linkState(this, 'partitionStrategy.options.square.radius')} name="radius" type={'number'} min={0} value={radius} max={1} step={0.1}></Input>
          </div>
        }

        throw new Error();
      });

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
          <Input onInput={linkState(this, 'partitionStrategy.choice', 'target.value')} type={'radio'} name="partitionStrategy" value={'voronoi'} checked={state.partitionStrategy.choice === 'voronoi'}>Voronoi</Input>
          <Input onInput={linkState(this, 'partitionStrategy.choice', 'target.value')} type={'radio'} name="partitionStrategy" value={'square'} checked={state.partitionStrategy.choice === 'square'}>Square</Input>
          <PartitionStrategy {...state.partitionStrategy}></PartitionStrategy>
        </div>

        <div>
          <Input onInput={linkState(this, 'waterStrategy.choice', 'target.value')} type={'radio'} name="waterStrategy" value={'perlin'} checked={state.waterStrategy.choice === 'perlin'}>Perlin</Input>
          <Input onInput={linkState(this, 'waterStrategy.choice', 'target.value')} type={'radio'} name="waterStrategy" value={'radial'} checked={state.waterStrategy.choice === 'radial'}>Radial</Input>
          <WaterStrategy {...state.waterStrategy}></WaterStrategy>
        </div>

        {Object.entries(state.seeds).map(([name, value]) => {
          const key = `seeds.${name}`;
          return <div>
            <Input onInput={linkState(this, key)} name={key} type={'number'} value={value}></Input>
          </div>
        })}
      </div>
    }
  }

  render(<MapSelectForm onUpdate={onStateUpdate}></MapSelectForm>, inputFormEl);
}

export function stateToMapGenOptions(data: any) {
  const options = {} as any;

  function handle(src: any, dest: any) {
    for (const [key, value] of Object.entries(src)) {
      if (value && typeof value === 'object' && key !== 'seeds') {
        // @ts-ignore
        dest[key] = { type: value.choice };
        // @ts-ignore
        handle(value.options[value.choice], dest[key]);
      } else {
        dest[key] = value;
      }
    }
  }
  handle(data, options);

  return options;
}
