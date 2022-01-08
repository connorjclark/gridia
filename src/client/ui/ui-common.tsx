import {h, render, Component, Fragment, VNode} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import createStore from 'redux-zero';
import {Provider, connect} from 'redux-zero/preact';
import {Actions, BoundActions} from 'redux-zero/types/Actions';

import {GFX_SIZE} from '../../constants.js';
import * as Content from '../../content.js';
import * as Utils from '../../utils.js';
import * as Helper from '../helper.js';

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

  return {SubApp, exportedActions, subscribe};
}

export interface TabbedPaneProps {
  tabs: Record<string, {label: string; content: Component['constructor']}>;
  childProps: any;
}
export class TabbedPane extends Component<TabbedPaneProps> {
  render(props: TabbedPaneProps) {
    const [currentId, setCurrentId] = useState(Object.keys(props.tabs)[0]);

    const tab = props.tabs[currentId];
    if (!tab) throw new Error('no tab');

    return <div class='tabbed-pane'>
      <div role='tablist' class='tabbed-pane__tabs flex justify-around'>
        {Object.entries(props.tabs).map(([id, t]) => {
          return <button
            role='tab'
            aria-controls={id}
            aria-selected={id === currentId}
            className={'tabbed-pane__tab ' + (id === currentId ? 'selected' : '')}
            onClick={() => setCurrentId(id)}>{t.label}</button>;
        })}
      </div>
      <div role='tabpanel' aria-labelledby={currentId}>
        <tab.content {...props.childProps}></tab.content>
      </div>
    </div>;
  }
}

// source: https://github.com/konvajs/use-image/blob/master/index.js
function useImage(url: string, crossOrigin = null) {
  const defaultState = {image: undefined, status: 'loading'};
  const res = useState<{image?: HTMLImageElement; status: string}>(defaultState);
  const image = res[0].image;
  const status = res[0].status;

  const setState = res[1];

  useEffect(
    function() {
      if (!url) return;

      const img = document.createElement('img');

      function onload() {
        setState({image: img, status: 'loaded'});
      }

      function onerror() {
        setState({image: undefined, status: 'failed'});
      }

      img.addEventListener('load', onload);
      img.addEventListener('error', onerror);
      crossOrigin && (img.crossOrigin = crossOrigin);
      img.src = url;

      return function cleanup() {
        img.removeEventListener('load', onload);
        img.removeEventListener('error', onerror);
        setState(defaultState);
      };
    },
    [url, crossOrigin]
  );

  return [image, status] as const;
}

interface GraphicProps {
  file: string;
  index: number;
  quantity?: number;
  scale?: number;
  title?: string;
}
export const Graphic = (props: GraphicProps) => {
  if (!props.file) return <div class="graphic">&nbsp;</div>;

  const baseDir = Content.getBaseDir();
  const templateImageSrc = `${baseDir}/graphics/${props.file}`;
  const [image, status] = useImage(templateImageSrc);

  let width, height;
  if (image && status === 'loaded') {
    width = image.width;
    height = image.height;
  } else if (status === 'failed') {
    console.error(`failed to load image: ${props.file}`);
  }

  if (!width || !height) return <div class="graphic">&nbsp;</div>;

  const tilesAcross = Math.round(width / GFX_SIZE);
  const tilesColumn = Math.round(height / GFX_SIZE);
  const x = props.index % tilesAcross;
  const y = Math.floor(props.index / tilesAcross);
  const label = props.quantity !== undefined && props.quantity !== 1 ? Utils.formatQuantity(props.quantity) : '';

  let style: { [key: string]: string | number } = {
    backgroundImage: `url(${templateImageSrc})`,
    backgroundPosition: `-${x * 100}% -${y * 100}%`,
    backgroundSize: `${tilesAcross * 100}% ${tilesColumn * 100}%`,
    width: 32 + 'px',
    maxWidth: 32 + 'px',
    height: 32 + 'px',
  };

  // TODO: remove? could just scale the width/height above ...
  if (props.scale) {
    style = {
      ...style,
      transform: `scale(${props.scale})`,
      marginLeft: (props.scale - 1) * GFX_SIZE + 'px',
      marginRight: (props.scale - 1) * GFX_SIZE + 'px',
    };
  }

  const optionalProps: any = {};
  if (props.title) optionalProps.title = props.title;

  return <div class="graphic" style={style} {...optionalProps}>{label}</div>;
};

export const FloorGraphic = (props: {floor: number}) => {
  const metaFloor = Content.getMetaFloor(props.floor);
  const graphicIndex = metaFloor.graphics?.frames[0] || 0;
  return <Graphic file={metaFloor.graphics.file} index={graphicIndex}></Graphic>;
};

export const ItemGraphic = (props: {item: Item; showLabel?: boolean}) => {
  const metaItem = Content.getMetaItem(props.item.type);
  const graphicIndex = metaItem.graphics?.frames[0] || 0;
  return <div class="flex flex-column align-items-center">
    {metaItem.graphics ? <Graphic
      file={metaItem.graphics.file}
      index={graphicIndex}
      quantity={props.item.quantity}
      title={metaItem.name}
    ></Graphic> : undefined}
    {props.showLabel ? metaItem.name : undefined}
  </div>;
};

interface CustomCreatureGraphicProps {
  graphics: Graphics[];
  scale?: number;
}
export function CustomCreatureGraphic(props: CustomCreatureGraphicProps) {
  const size = (props.scale || 1) * GFX_SIZE;
  // TODO: using margin here is a hack ...
  return <div class="custom-creature-graphic" style={
    {width: size + 'px', height: size + 'px', marginRight: size + 'px'}}>
    {props.graphics.map((graphic) => {
      return <div style={{position: 'absolute'}}>
        <Graphic file={graphic.file} index={graphic.frames[0]} scale={props.scale}></Graphic>
      </div>;
    })}
  </div>;
}

export function makeCustomCreatureGraphicComponent(props: CustomCreatureGraphicProps) {
  const el = Helper.createElement('div');
  render(<CustomCreatureGraphic {...props} />, el);
  return el;
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
    <div class="bar__bg" style={{width: `${percent}%`, backgroundColor: props.color}}>&nbsp;</div>
  </div>;
};

export const Input = (props: any) => {
  return <Fragment>
    <label>{props.children || props.name}</label>
    <input {...props}></input>
    {props.type === 'range' && props.value}
  </Fragment>;
};

interface PaginatedContentProps {
  itemsPerPage: number;
  items: any[];
  renderItems: (items: any[]) => VNode;
}

export class PaginatedContent extends Component<PaginatedContentProps> {
  render() {
    const {itemsPerPage, items, renderItems} = this.props;
    const [currentPage, setCurrentPage] = useState(0);
    useEffect(() => {
      setCurrentPage(0);
    }, [items]);

    const numPages = Math.ceil(items.length / itemsPerPage);
    const startIndex = itemsPerPage * currentPage;
    const paginatedItems = items.slice(startIndex, startIndex + itemsPerPage);

    return <div>
      <button disabled={currentPage === 0} onClick={() => setCurrentPage(currentPage - 1)}>{'<'}</button>
      <button disabled={currentPage === numPages - 1} onClick={() => setCurrentPage(currentPage + 1)}>{'>'}</button>
      page {currentPage + 1} of {numPages}
      {renderItems(paginatedItems)}
    </div>;
  }
}
