import panzoom from 'panzoom';
// @ts-expect-error
import makePanzoomDomController from 'panzoom/lib/domController.js';
import {h} from 'preact';
import {useCallback, useEffect, useRef, useState} from 'preact/hooks';

import {GFX_SIZE} from '../../../constants.js';
import * as Content from '../../../content.js';
import {game} from '../../../game-singleton.js';
import * as Player from '../../../player.js';
import * as Utils from '../../../utils.js';
import {WorldMapPartition} from '../../../world-map-partition.js';

import {FloorGraphic, ItemGraphic} from './graphic.js';

interface FixedCanvasSize {
  type: 'fixed';
  canvasWidth: number;
  canvasHeight: number;
}

interface MapViewProps {
  partition: WorldMapPartition;
  focusPos: Point4;
  sizing: FixedCanvasSize;
  zoom0TileScale?: number;
  allowDrag: boolean;
  allowZoom: boolean;
  initialZoomLevel?: number;
  minZoomLevel?: number;
  blinkFocusPos: boolean;
  chunked: boolean;
  usePlayerTileSeenData?: boolean;
}
export const MapView = (props: MapViewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomLevel0DivRef = useRef<HTMLDivElement>(null);

  // Higher is more zoomed out. 0 renders the actual tiles.
  const [zoomLevel, setZoomLevel] = useState(props.initialZoomLevel ?? 2);

  // Hacky way to reference the latest props in useEffect.
  const propsRef = useRef(props);
  propsRef.current = props;

  const zoomLevelToPixelsPerTile = [0, 4, 3, 2, 1];

  const [focusPosDelta, setFocusPosDelta] = useState({x: 0, y: 0});
  useEffect(() => {
    const ref = zoomLevel === 0 ? zoomLevel0DivRef : canvasRef;
    if (!ref.current) return;
    if (!props.allowDrag) return;

    const instance = panzoom(ref.current, {
      zoomSpeed: 0,
      pinchSpeed: 0,
      smoothScroll: false,
      controller: {
        ...makePanzoomDomController(ref.current, {}),
        applyTransform(transform) {
          transform.x = Utils.clamp(transform.x, -props.partition.width, 0);
          transform.y = Utils.clamp(transform.y, -props.partition.height, 0);
          setFocusPosDelta({x: -Math.floor(transform.x), y: -Math.floor(transform.y)});
        },
      },
      initialX: props.focusPos.x,
      initialY: props.focusPos.y,
    });
    return () => instance.dispose();
  }, [canvasRef.current, zoomLevel0DivRef.current, props.allowDrag, props.focusPos, props.partition, zoomLevel]);

  let numDraws = 0;
  const drawCanvasCb = useCallback(() => {
    if (!canvasRef.current) return;
    if (zoomLevel === 0) return;

    const pixelsPerTile = zoomLevelToPixelsPerTile[zoomLevel];
    const focusPos = Utils.pointAdd(props.focusPos, focusPosDelta);
    draw(propsRef.current, focusPos, pixelsPerTile, numDraws, canvasRef.current);
    numDraws += 1;
  }, [canvasRef.current, zoomLevel, props.focusPos, focusPosDelta]);

  useEffect(() => {
    if (zoomLevel === 0) return;

    const handle = setInterval(drawCanvasCb, 500);
    drawCanvasCb();
    return () => clearInterval(handle);
  }, [zoomLevel, drawCanvasCb]);

  let view;
  if (zoomLevel === 0) {
    // TODO: pos doesn't persist between zoom level 0 and 1+.
    const focusPos = Utils.pointAdd(propsRef.current.focusPos, focusPosDelta);
    view = <div ref={zoomLevel0DivRef}
      style={`width: ${props.sizing.canvasWidth}px; height: ${props.sizing.canvasHeight}px`}>
      <MapViewTiles {...props} focusPos={focusPos}></MapViewTiles>
    </div>;
  } else {
    view = <canvas ref={canvasRef} width={props.sizing.canvasWidth} height={props.sizing.canvasHeight}></canvas>;
  }

  return <div class="mapview">
    {view}
    {props.allowZoom && <div class="mapview__zoom">
      <button onClick={() => setZoomLevel(Math.min(zoomLevel + 1, zoomLevelToPixelsPerTile.length - 1))}>-</button>
      <button onClick={() => setZoomLevel(Math.max(zoomLevel - 1, props.minZoomLevel || 0))}>+</button>
    </div>
    }
  </div>;
};

const MapViewTiles = (props: MapViewProps) => {
  const scale = props.zoom0TileScale || 0.5;
  const width = Math.round(props.sizing.canvasWidth / (GFX_SIZE * scale));
  const height = Math.round(props.sizing.canvasHeight / (GFX_SIZE * scale));
  const {x, y, z} = props.focusPos;

  const rows = [];
  for (let j = 0; j < height; j++) {
    const row: any[] = [];
    rows.push(row);
    for (let i = 0; i < width; i++) {
      const pos = {x: i + x, y: j + y, z};
      const tile = props.partition.getTile(pos);
      const templatingContext = {pos, partition: props.partition};
      const floorGfx = <FloorGraphic floor={tile.floor} scale={scale} templating={templatingContext}></FloorGraphic>;
      const itemGfx = tile.item &&
        <ItemGraphic item={tile.item} scale={scale} templating={templatingContext}></ItemGraphic>;

      row.push(<div class="mapviewtiles__tile">
        {floorGfx}
        <div style="position: absolute; top: 0; left: 0">{itemGfx}</div>
      </div>);
    }
  }

  return <div class="mapviewtiles">
    {rows.map((row) => {
      return <div class='mapviewtiles__row'>{row}</div>;
    })}
  </div>;
};

function draw(props: MapViewProps, focusPos: Point4, pixelsPerTile: number,
              numDraws: number, canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('could not make context');

  context.fillStyle = 'grey';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const chunkWidth = Math.floor(canvas.width / pixelsPerTile);
  const chunkHeight = Math.floor(canvas.height / pixelsPerTile);
  const partition = props.partition;
  const floors = Content.getFloors();

  let startX, startY;
  if (props.chunked) {
    startX = Math.floor(focusPos.x / chunkWidth) * chunkWidth;
    startY = Math.floor(focusPos.y / chunkHeight) * chunkHeight;
  } else {
    startX = Math.max(0, focusPos.x - Math.floor(chunkWidth / 2));
    startY = Math.max(0, focusPos.y - Math.floor(chunkHeight / 2));
  }

  for (let x = 0; x < chunkWidth; x++) {
    for (let y = 0; y < chunkHeight; y++) {
      const pos = {...focusPos, x: x + startX, y: y + startY};
      if (!partition.inBounds(pos)) continue;

      let floor, walkable, elevationGrade;
      if (props.usePlayerTileSeenData) {
        ({floor, walkable, elevationGrade} = Player.getTileSeenData(game.client.player, pos));
      } else {
        const tile = props.partition.getTile(pos);
        floor = tile.floor;
        walkable = !(tile.item && Content.getMetaItem(tile.item.type).blocksMovement);
        elevationGrade = tile.elevation;
      }

      if (floor === 0 && !walkable) continue;

      let color;
      if (!walkable) {
        color = '#000000';
      } else {
        color = '#' + floors[floor]?.color || '000000';
      }

      if (elevationGrade > 0) {
        color = shadeColor(color, 0.9);
      } else if (elevationGrade < 0) {
        color = shadeColor(color, 1.1);
      }

      context.fillStyle = color;
      context.fillRect(x * pixelsPerTile, y * pixelsPerTile, pixelsPerTile, pixelsPerTile);
    }
  }

  if (props.blinkFocusPos && numDraws % 2 === 0) {
    const x = focusPos.x - startX;
    const y = focusPos.y - startY;
    context.fillStyle = 'gold';
    context.fillRect((x - 1.5) * pixelsPerTile, (y - 1.5) * pixelsPerTile, pixelsPerTile * 3, pixelsPerTile * 3);
  }
}

/**
 * https://stackoverflow.com/a/69123384/2788187
 *
 * @param color Hex value format: #ffffff or ffffff
 * @param decimal lighten or darken decimal value, example 0.5 to lighten by 50% or 1.5 to darken by 50%.
 */
function shadeColor(color: string, decimal: number): string {
  const base = color.startsWith('#') ? 1 : 0;

  let r = parseInt(color.substring(base, 3), 16);
  let g = parseInt(color.substring(base + 2, 5), 16);
  let b = parseInt(color.substring(base + 4, 7), 16);

  r = Math.round(r / decimal);
  g = Math.round(g / decimal);
  b = Math.round(b / decimal);

  r = (r < 255) ? r : 255;
  g = (g < 255) ? g : 255;
  b = (b < 255) ? b : 255;

  const rr = ((r.toString(16).length === 1) ? `0${r.toString(16)}` : r.toString(16));
  const gg = ((g.toString(16).length === 1) ? `0${g.toString(16)}` : g.toString(16));
  const bb = ((b.toString(16).length === 1) ? `0${b.toString(16)}` : b.toString(16));

  return `#${rr}${gg}${bb}`;
}
