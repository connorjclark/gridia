import {h} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';

import * as Content from '../../content.js';
import {game} from '../../game-singleton.js';
import * as Player from '../../player.js';
import {WorldMapPartition} from '../../world-map-partition.js';

import {FloorGraphic, ItemGraphic} from './ui-common.js';

// TODO: drag
// TODO: chunked vs centered focusPos
// TODO: blinkFocusPos
// TODO: min/max zoomLevel
// TODO: figure out sizing
// TODO: use to replace MapViewOld

interface FixedCanvasSize {
  type: 'fixed';
  canvasWidth: number;
  canvasHeight: number;
}

interface FitContentCanvasSize {
  type: 'fit-content';
}

interface MapViewProps {
  partition: WorldMapPartition;
  focusPos: Point4;
  sizing: FixedCanvasSize | FitContentCanvasSize;
  allowZoom: boolean;
  // usePlayerTileSeenData?: boolean;
}
export function MapView(props: MapViewProps) {
  if (props.sizing.type === 'fixed') {
    if (props.sizing.canvasWidth !== props.sizing.canvasHeight) throw new Error('TODO');
  }

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Higher is more zoomed out. 0 renders the actual tiles.
  const [zoomLevel, setZoomLevel] = useState(3);

  // Hacky way to reference the latest props in useEffect.
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    let numDraws = 0;
    const redraw = () => {
      if (!canvasRef.current) return;
      if (zoomLevel === 0) return;

      const pixelsPerTile = [4, 3, 2, 1][zoomLevel - 1];
      draw(propsRef.current, pixelsPerTile, numDraws, canvasRef.current);
      numDraws += 1;
    };
    const handle = setInterval(redraw, 500);
    redraw();
    return () => clearInterval(handle);
  }, [zoomLevel]);

  let view;
  if (zoomLevel === 0) {
    view = <MapViewTiles {...props}></MapViewTiles>;
  } else {
    view = props.sizing.type === 'fixed' ?
      <canvas ref={canvasRef} width={props.sizing.canvasWidth} height={props.sizing.canvasHeight}></canvas> :
      <canvas ref={canvasRef}></canvas>;
  }

  return <div>
    {view}
    {props.allowZoom && <div>
      <button onClick={() => setZoomLevel(Math.min(zoomLevel + 1, 4))}>-</button>
      <button onClick={() => setZoomLevel(Math.max(zoomLevel - 1, 0))}>+</button>
    </div>
    }
  </div>;
}

const MapViewTiles = (props: MapViewProps) => {
  // if (props.sizing.type !== 'fit-content') return <div>?</div>;

  const width = 5;
  const height = 5;
  const {x, y, z} = props.focusPos;

  const rows = [];

  for (let j = 0; j < height; j++) {
    const row: any[] = [];
    rows.push(row);
    for (let i = 0; i < width; i++) {
      const tile = props.partition.getTile({x: i + x, y: j + y, z});
      const floorGfx = <FloorGraphic floor={tile.floor} scale={0.5}></FloorGraphic>;
      const itemGfx = tile.item && <ItemGraphic item={tile.item} scale={0.5}></ItemGraphic>;

      row.push(<div class="mapview__tile">
        {floorGfx}
        <div style="position: absolute; top: 0; left: 0">{itemGfx}</div>
      </div>);
    }
  }

  // TODO: rename class mapviewtiles
  return <div class="mapview">
    {rows.map((row) => {
      return <div class='mapview__row'>{row}</div>;
    })}
  </div>;
};

function draw(props: MapViewProps, pixelsPerTile: number, numDraws: number, canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('could not make context');

  context.fillStyle = 'grey';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const chunkSize = Math.floor(canvas.width / pixelsPerTile);
  const focusPos = props.focusPos;
  const partition = props.partition;

  const startX = Math.floor(focusPos.x / chunkSize) * chunkSize;
  const startY = Math.floor(focusPos.y / chunkSize) * chunkSize;
  const floors = Content.getFloors();

  for (let x = 0; x < chunkSize; x++) {
    for (let y = 0; y < chunkSize; y++) {
      const pos = {...focusPos, x: x + startX, y: y + startY};
      if (!partition.inBounds(pos)) continue;

      const mark = Player.getTileSeenData(game.client.player, pos);
      if (mark.floor === 0 && !mark.walkable) continue;

      const {floor, walkable, elevationGrade} = mark;

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

  if (numDraws % 2 === 0) {
    context.fillStyle = 'gold';
    const x = ((focusPos.x % chunkSize) - 3 / 2) * pixelsPerTile;
    const y = ((focusPos.y % chunkSize) - 3 / 2) * pixelsPerTile;
    context.fillRect(x, y, pixelsPerTile * 3, pixelsPerTile * 3);
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
