import { h, render, Component } from 'preact';
import createStore from 'redux-zero';
import { Provider, connect } from 'redux-zero/preact';
import { Actions, BoundActions } from 'redux-zero/types/Actions';
import { GFX_SIZE } from '../../constants';
import * as Utils from '../../utils';
import * as Helper from '../helper';
import { ImageResources } from '../lazy-resource-loader';

export type ComponentProps<S, T extends Actions<S>> = S & BoundActions<S, T>;
type OmitFirstArg<F> = F extends (x: any, ...args: infer P) => infer R ? (...args: P) => R : never;
type ExportedActions<A> = { [K in keyof A]: A[K] extends Function ? OmitFirstArg<A[K]> : never };

export function createSubApp<S, A>(component: any, initialState: S, actions: () => A) {
  // const mapToProps = ({ possibleUsages, selectedTool }: State) => ({ possibleUsages, selectedTool });
  const mapToProps = (f: any) => f;
  const ConnectedComponent = connect(mapToProps, actions)(component);
  const store = createStore(initialState);
  const SubApp = () => (
    <Provider store={store}>
      <ConnectedComponent value={10} />
    </Provider>
  );

  const actionsObj = actions();
  // @ts-expect-error
  const exportedActions: ExportedActions<A> = actionsObj;
  // eslint-disable-next-line guard-for-in
  for (const key in exportedActions) {
    const fn = exportedActions[key];
    // @ts-expect-error
    exportedActions[key] = (...args: any[]) => {
      const newState = fn(store.getState(), ...args);
      // @ts-expect-error
      store.setState(newState);
    };
  }

  const subscribe = (fn: (state: S) => void) => {
    store.subscribe(fn);
  };

  return { SubApp, exportedActions, subscribe };
}

export function makeUIWindow(opts: { name: string; cell: string; noscroll?: boolean }) {
  const cellEl = Helper.find(`.ui .grid-container > .${opts.cell}`);
  const el = Helper.createChildOf(cellEl, 'div', `window window--${opts.name}`);
  el.classList.toggle('window--noscroll', Boolean(opts.noscroll));
  return el;
}

interface GraphicProps {
  file: string;
  index: number;
  quantity?: number;
  scale?: number;
}
export const Graphic = (props: GraphicProps) => {
  const res = ImageResources.find((r) => r.file === 'world/graphics/' + props.file);
  const width = res?.width || 320;
  const tilesAcross = width / GFX_SIZE;
  const x = props.index % tilesAcross;
  const y = Math.floor(props.index / tilesAcross);
  const backgroundImage = `url(world/graphics/${props.file})`;
  const label = props.quantity !== undefined && props.quantity !== 1 ? Utils.formatQuantity(props.quantity) : '';

  let style: { [key: string]: string | number } = {
    backgroundImage,
    backgroundPosition: `-${x * 32}px -${y * 32}px`,
    width: '32px',
    maxWidth: '32px',
    height: '32px',
  };
  if (props.scale) {
    style = {
      ...style,
      transform: `scale(${props.scale})`,
      marginLeft: (props.scale - 1) * GFX_SIZE + 'px',
      marginRight: (props.scale - 1) * GFX_SIZE + 'px',
    };
  }

  return <div class="graphic" style={style}>{label}</div>;
};

interface CustomCreatureGraphicProps {
  arms: { file: string; frames: number[] };
  head: { file: string; frames: number[] };
  chest: { file: string; frames: number[] };
  legs: { file: string; frames: number[] };
  shield?: { file: string; frames: number[] };
  weapon?: { file: string; frames: number[] };
  scale?: number;
}
export function CustomCreatureGraphic(props: CustomCreatureGraphicProps) {
  const size = (props.scale || 1) * GFX_SIZE;
  // TODO: using margin here is a hack ...
  return <div class="custom-creature-graphic" style={
    { width: size + 'px', height: size + 'px', marginRight: size + 'px' }}>
    {Object.entries(props).map(([key, value]) => {
      if (key === 'scale' || value === undefined) return;

      return <div style={{ position: 'absolute' }}>
        <Graphic file={value.file} index={value.frames[0]} scale={props.scale}></Graphic>
      </div>;
    })}
  </div>;
}

export function makeGraphicComponent() {
  interface GraphicComponentState {
    graphic?: GraphicProps;
  }

  let setState = (_: Partial<GraphicComponentState>) => {
    // Do nothing.
  };

  class GraphicComponent extends Component {
    state: GraphicComponentState = {};

    componentDidMount() {
      setState = this.setState.bind(this);
    }

    render() {
      let graphic;
      if (this.state.graphic) graphic = <Graphic {...this.state.graphic} />;
      return <div class="graphic">{graphic}</div>;
    }
  }

  const el = Helper.createChildOf(Helper.find('.ui'), 'graphic');
  render(<GraphicComponent />, el);
  return {
    el,
    setState: (s: Partial<GraphicComponentState>) => setState(s),
  };
}

export const Bar = (props: { label: string; color: string; current: number; max: number }) => {
  const percent = 100 * props.current / props.max;
  return <div class="bar">
    <div class="bar__label">
      <span>{props.label}:&nbsp;</span><span>{props.current}&nbsp;/&nbsp;{props.max}</span>
    </div>
    <div class="bar__bg" style={{ width: `${percent}%`, backgroundColor: props.color }}>&nbsp;</div>
  </div>;
};
