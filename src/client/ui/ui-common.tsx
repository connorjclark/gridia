import {h, render, Component, Fragment, VNode} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import createStore from 'redux-zero';
import {Provider, connect} from 'redux-zero/preact';
import {Actions, BoundActions} from 'redux-zero/types/Actions';

import {GFX_SIZE} from '../../constants.js';
import * as Content from '../../content.js';
import * as Utils from '../../utils.js';
import {WorldMapPartition} from '../../world-map-partition.js';
import {Game} from '../game.js';
import * as Helper from '../helper.js';
import {getIndexOffsetForTemplate} from '../template-draw.js';

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
  tabs: Record<string, { label: string; content: Component['constructor'] }>;
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

export function usePartition(game: Game, w: number) {
  const [partition, setPartition] = useState<WorldMapPartition | null>(null);

  const partitionRequest = useMemo(() => {
    return game.client.getOrRequestPartition(w);
  }, [w]);
  if (!partitionRequest.partition) {
    partitionRequest.promise.then(setPartition);
  } else if (partitionRequest.partition !== partition) {
    setPartition(partitionRequest.partition);
  }

  return partition;
}

interface ImageSizeResult {
  status: string;
  width: number;
  height: number;
}
const imageSizeCache = new Map<string, ImageSizeResult>();
const imageSizeCachePromises = new Map<string, Promise<ImageSizeResult>>();
function getImageSize(url: string) {
  const size = imageSizeCache.get(url);
  if (size) return {size, promise: null};

  const promise = new Promise<ImageSizeResult>((resolve) => {
    const img = document.createElement('img');
    img.addEventListener('load', () => resolve({status: 'loaded', width: img.width, height: img.height}));
    img.addEventListener('error', () => resolve({status: 'failed', width: 0, height: 0}));
    img.src = url;
  }).then((result) => {
    imageSizeCache.set(url, result);
    imageSizeCachePromises.delete(url);
    return result;
  });
  imageSizeCachePromises.set(url, promise);

  return {size: null, promise};
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

  // Need to know how big the spritesheet is before we can crop based on tile index.
  const imageSizeQuery = getImageSize(templateImageSrc);
  const [imageSize, setImageSize] = useState(imageSizeQuery.size);
  useEffect(() => {
    if (imageSizeQuery.size) return;

    imageSizeQuery.promise.then(setImageSize);
  }, [templateImageSrc]);
  if (!imageSize) return <div class="graphic">&nbsp;</div>;

  const tilesAcross = Math.round(imageSize.width / GFX_SIZE);
  const tilesColumn = Math.round(imageSize.height / GFX_SIZE);
  const x = props.index % tilesAcross;
  const y = Math.floor(props.index / tilesAcross);
  const label = props.quantity !== undefined && props.quantity !== 1 ? Utils.formatQuantity(props.quantity) : '';

  const size = 32 * (props.scale || 1);

  const style: { [key: string]: string | number } = {
    backgroundImage: `url(${templateImageSrc})`,
    backgroundPosition: `-${x * 100}% -${y * 100}%`,
    backgroundSize: `${tilesAcross * 100}% ${tilesColumn * 100}%`,
    width: size + 'px',
    minWidth: size + 'px',
    maxWidth: size + 'px',
    height: size + 'px',
  };

  const optionalProps: any = {};
  if (props.title) optionalProps.title = props.title;

  return <div class="graphic" style={style} {...optionalProps}>{label}</div>;
};

interface GraphicTemplatingContext {
  pos: Point3;
  partition: WorldMapPartition;
}

export const FloorGraphic = (props: { floor: number; scale?: number; templating?: GraphicTemplatingContext }) => {
  const metaFloor = Content.getMetaFloor(props.floor);
  let graphicIndex = metaFloor.graphics?.frames[0] || 0;

  let meta;
  if (props.templating && (meta = Content.getMetaFloor(props.floor)) && meta.graphics.templateType) {
    const {pos, partition} = props.templating;
    graphicIndex += getIndexOffsetForTemplate(partition, props.floor, pos, meta.graphics, 'floor');
  }

  return <Graphic file={metaFloor.graphics.file} index={graphicIndex} scale={props.scale}></Graphic>;
};

export const ItemGraphic = (props:
{ item: Item; showLabel?: boolean; scale?: number; templating?: GraphicTemplatingContext }) => {
  const metaItem = Content.getMetaItem(props.item.type);
  let graphicIndex = metaItem.graphics?.frames[0] || 0;

  if (props.templating && metaItem.graphics.templateType) {
    const {pos, partition} = props.templating;
    graphicIndex += getIndexOffsetForTemplate(partition, props.item.type, pos, metaItem.graphics, 'item');
  }

  return <div class="flex flex-column align-items-center">
    {metaItem.graphics ? <Graphic
      file={metaItem.graphics.file}
      index={graphicIndex}
      quantity={props.item.quantity}
      title={metaItem.name}
      scale={props.scale}
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
