import {h, render, Component, type JSX} from 'preact';
import {useEffect, useState} from 'preact/hooks';

import {GFX_SIZE} from '../../../constants.js';
import * as Content from '../../../content.js';
import * as Utils from '../../../utils.js';
import {WorldMapPartition} from '../../../world-map-partition.js';
import * as Helper from '../../helper.js';
import {getIndexOffsetForTemplate} from '../../template-draw.js';

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
  const baseDir = Content.getBaseDir();
  const templateImageSrc = props.file ? `${baseDir}/graphics/${props.file}` : '';

  // Need to know how big the spritesheet is before we can crop based on tile index.
  const imageSizeQuery = templateImageSrc ? getImageSize(templateImageSrc) : undefined;
  const [imageSize, setImageSize] = useState(imageSizeQuery?.size);
  useEffect(() => {
    if (!imageSizeQuery) return;

    if (imageSizeQuery.promise) {
      imageSizeQuery.promise.then(setImageSize);
    } else {
      setImageSize(imageSizeQuery.size);
    }
  }, [imageSizeQuery]);

  const tilesAcross = imageSize ? Math.round(imageSize.width / GFX_SIZE) : 1;
  const tilesColumn = imageSize ? Math.round(imageSize.height / GFX_SIZE) : 1;
  const x = props.index % tilesAcross;
  const y = Math.floor(props.index / tilesAcross);
  const quantityStr = props.quantity !== undefined && props.quantity !== 1 ? Utils.formatQuantity(props.quantity) : '';

  const size = 32 * (props.scale || 1);
  const sizePx = `${size}px`;

  const style: JSX.CSSProperties = {
    backgroundImage: imageSize ? `url(${templateImageSrc})` : '',
    backgroundPosition: `-${x * 100}% -${y * 100}%`,
    backgroundSize: `${tilesAcross * 100}% ${tilesColumn * 100}%`,
    width: sizePx,
    height: sizePx,
  };

  const optionalProps: any = {};
  if (props.title) optionalProps.title = props.title;

  return <div class="graphic" {...optionalProps}>
    <div class="graphic__image" style={style}></div>
    {quantityStr ? <div class="graphic__quantity">{quantityStr}</div> : null}
  </div>;
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

export const CreatureGraphic = (props: { type: number; scale?: number }) => {
  const monster = Content.getMonsterTemplate(props.type);
  if (!monster) return <div></div>;

  const graphicIndex = monster.graphics?.frames[0] || 0;
  return <Graphic file={monster.graphics.file} index={graphicIndex} scale={props.scale}></Graphic>;
};

export const ItemGraphic = (props:
{ item: Item | null; showLabel?: boolean; scale?: number; templating?: GraphicTemplatingContext }) => {
  const metaItem = Content.getMetaItem(props.item?.type || 0);
  let graphicIndex = metaItem.graphics?.frames[0] || 0;

  if (props.templating && metaItem.graphics.templateType) {
    const {pos, partition} = props.templating;
    graphicIndex += getIndexOffsetForTemplate(partition, metaItem.id, pos, metaItem.graphics, 'item');
  }

  return <div class="flex flex-column align-items-center">
    {metaItem.graphics ? <Graphic
      file={metaItem.graphics.file}
      index={graphicIndex}
      quantity={props.item?.quantity ?? 1}
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
export const CustomCreatureGraphic = (props: CustomCreatureGraphicProps) => {
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
};

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
