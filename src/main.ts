import { worldToTile } from './utils'
import { openAndConnectToServerInMemory } from './server'
import { ClientProtocolContext } from './context'
import { getMetaItem } from './items'

const context = new ClientProtocolContext()
const wire = openAndConnectToServerInMemory(context)

const state = {
  viewport: {
    x: 0,
    y: 0,
  },
  mouse: {
    x: 0,
    y: 0,
    tile: { x: 0, y: 0 },
    downTile: null,
    state: '',
  }
}

function mouseToWorld(pm: Point): Point {
  return {
    x: pm.x + state.viewport.x,
    y: pm.y + state.viewport.y,
  };
}

function tileToScreen(pt: Point): Point {
  return {
    x: pt.x * 32 - state.viewport.x,
    y: pt.y * 32 - state.viewport.y,
  }
}

function main(gl, ctx: CanvasRenderingContext2D) {
  const speed = 5;

  if (state.keys[38]) {
    state.viewport.y += -speed;
  }
  if (state.keys[40]) {
    state.viewport.y -= -speed;
  }
  if (state.keys[37]) {
    state.viewport.x -= speed;
  }
  if (state.keys[39]) {
    state.viewport.x += speed;
  }

  window.requestAnimationFrame(() => main(gl, ctx))

  // Set clear color to black, fully opaque
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  // Clear the color buffer with specified clear color
  gl.clear(gl.COLOR_BUFFER_BIT);

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // ctx.beginPath();
  // ctx.closePath();

  ctx.textAlign = "center";

  if (state.mouse.state === 'up') {
    wire.send('moveItem', {
      from: state.mouse.downTile,
      to: state.mouse.tile,
    });
    // if (inBounds(state.mouse.tile) && !state.world.tiles[state.mouse.tile.x][state.mouse.tile.y].item) {
    // }

    delete state.mouse.state;
    delete state.mouse.downTile;
  }

  const tilesWidth = Math.ceil(gl.canvas.width / 32);
  const tilesHeight = Math.ceil(gl.canvas.height / 32);
  const startTileX = Math.floor(state.viewport.x / 32);
  const startTileY = Math.floor(state.viewport.y / 32);
  const endTileX = startTileX + tilesWidth;
  const endTileY = startTileY + tilesHeight;

  for (let x = startTileX; x <= endTileX; x++) {
    for (let y = startTileY; y <= endTileY; y++) {
      if (!context.world.inBounds({ x, y })) continue;

      const tile = context.world.getTile({ x, y })
      const sx = x * 32 - state.viewport.x;
      const sy = y * 32 - state.viewport.y;

      // TODO webgl
      drawFloor(ctx, { x, y }, sx, sy)

      if (tile.item) {
        // TODO webgl
        drawItem(ctx, tile.item, sx, sy)
      }
    }
  }

  if (context.world.inBounds(state.mouse.tile)) {
    ctx.fillStyle = "yellow";
    ctx.strokeStyle = "yellow";
    ctx.lineWidth = 5;
    ctx.beginPath();
    const { x, y } = tileToScreen(state.mouse.tile);
    ctx.rect(x, y, 32, 32);
    ctx.stroke();
    ctx.closePath();
    // ctx.fillText(`${x}, ${y}`, (x + 0.5) * 32, (y + 0.5) * 32);
  }

  // only dragged items should be drawn on bottom part of canvas
  ctx.clearRect(0, gl.canvas.height, ctx.canvas.width, ctx.canvas.height);

  if (state.mouse.state === 'down' && context.world.inBounds(state.mouse.downTile)) {
    const item = context.world.getItem(state.mouse.downTile)
    const { x, y } = state.mouse
    drawItem(ctx, item, x, y)
  }
}

function loadImage(url) {
  return new Promise(resolve => { let i = new Image(); i.onload = () => { resolve(i) }; i.src = url; });
}

const spritesheets = {}
function loadSpritesheet(type, index) {
  const key = `${type}${index}`
  let spritesheet = spritesheets[key]
  if (!spritesheet) {
    spritesheet = spritesheets[key] = new Image(320, 320) // stub
    loadImage(`/world/${type}/${type}${index}.png`).then(img => {
      spritesheets[key] = img
    })
  }
  return spritesheet
}

function drawItem(ctx: CanvasRenderingContext2D, item: Item, x: number, y: number) {
  const metaItem = getMetaItem(item.type)
  const spritesheetIndex = Math.floor(metaItem.animations[0] / 100)
  const spritesheet = loadSpritesheet('items', spritesheetIndex)
  const sx = (item.type % 10) * 32
  const sy = Math.floor((item.type % 100) / 10) * 32
  ctx.drawImage(spritesheet, sx, sy, 32, 32, x, y, 32, 32)
}

function drawFloor(ctx: CanvasRenderingContext2D, point: Point, x: number, y: number) {
  const floor = context.world.getTile(point).floor
  if (floor === 1) {
    drawWater(ctx, point, x, y)
    return
  }

  const spritesheetIndex = Math.floor(floor / 100)
  const spritesheet = loadSpritesheet('floors', spritesheetIndex)
  const sx = (floor % 10) * 32
  const sy = Math.floor((floor % 100) / 10) * 32
  ctx.drawImage(spritesheet, sx, sy, 32, 32, x, y, 32, 32)
}

function drawWater(ctx: CanvasRenderingContext2D, point: Point, x: number, y: number) {
  const spritesheet = loadSpritesheet('templates', 0)
  const templateIndex = useTemplate(0, 1, point.x, point.y, 0)
  const sx = (templateIndex % 10) * 32
  const sy = Math.floor((templateIndex % 100) / 10) * 32
  ctx.drawImage(spritesheet, sx, sy, 32, 32, x, y, 32, 32)
}

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.querySelector<HTMLCanvasElement>("#glCanvas");
  // Initialize the GL context
  const gl = canvas.getContext("webgl");

  // Only continue if WebGL is available and working
  if (gl === null) {
    alert("Unable to initialize WebGL. Your browser or machine may not support it.");
    return;
  }

  const ctx = document.querySelector<HTMLCanvasElement>("#ctxText").getContext('2d');

  document.onmousemove = (e) => {
    state.mouse = {
      ...state.mouse,
      x: e.clientX,
      y: e.clientY,
      tile: worldToTile(mouseToWorld({ x: e.clientX, y: e.clientY })),
    }
  }

  document.onmousedown = (e) => {
    if (!context.world.inBounds(state.mouse.tile) || !context.world.getItem(state.mouse.tile)) {
      delete state.mouse.state;
      return;
    }

    state.mouse = {
      ...state.mouse,
      state: 'down',
      downTile: state.mouse.tile,
    }
  }

  document.onmouseup = (e) => {
    if (state.mouse.state !== 'down') return;

    state.mouse = {
      ...state.mouse,
      state: 'up',
    }
  }

  document.onclick = (e) => {
    const point = worldToTile(mouseToWorld({ x: e.clientX, y: e.clientY }))
    if (context.world.inBounds(point)) {
      context.world.getTile(point).floor = ++context.world.getTile(point).floor % 10
    }
  }

  state.keys = {};
  document.onkeydown = (e) => {
    state.keys[e.keyCode] = true;
  }
  document.onkeyup = (e) => {
    delete state.keys[e.keyCode];
  }

  // resize the canvas to fill browser window dynamically
  function resize() {
    gl.canvas.width = window.innerWidth;
    gl.canvas.height = gl.canvas.parentElement.getBoundingClientRect().bottom;
    ctx.canvas.width = window.innerWidth;
    ctx.canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  window.requestAnimationFrame(() => main(gl, ctx))
})

// generalize
// this is only for floors right now
// more uses?
function useTemplate(templateId: number, typeToMatch: number, x: number, y: number, z: number) {
  var size = context.world.size;
  var xl = x == 0 ? size - 1 : x - 1;
  var xr = x == size - 1 ? 0 : x + 1;
  var yu = y == 0 ? size - 1 : y + 1;
  var yd = y == size - 1 ? 0 : y - 1;

  var below = context.world.getTile({ x, y: yu, z }).floor == typeToMatch;
  var above = context.world.getTile({ x, y: yd, z }).floor == typeToMatch;
  var left = context.world.getTile({ x: xl, y, z }).floor == typeToMatch;
  var right = context.world.getTile({ x: xr, y, z }).floor == typeToMatch;

  var offset = templateId * 50;
  var v = (above ? 1 : 0) + (below ? 2 : 0) + (left ? 4 : 0) + (right ? 8 : 0);

  // this is where the complicated crap kicks in
  // i'd really like to replace this.
  // :'(
  // this is mostly guess work. I think. I wrote this code years ago. I know it works,
  // so I just copy and pasted. Shame on me.
  // ^ nov 2014
  // update: just copied this again here in dec 2018

  var downleft = context.world.getTile({ x: xl, y: yu, z }).floor == typeToMatch;
  var downright = context.world.getTile({ x: xr, y: yu, z }).floor == typeToMatch;
  var upleft = context.world.getTile({ x: xl, y: yd, z }).floor == typeToMatch;
  var upright = context.world.getTile({ x: xr, y: yd, z }).floor == typeToMatch;

  if (v == 15) {
    if (!upleft) {
      v++;
    }
    if (!upright) {
      v += 2;
    }
    if (!downleft) {
      v += 4;
    }
    if (!downright) {
      v += 8;
    }
  }
  else if (v == 5) {
    if (!upleft) {
      v = 31;
    }
  }
  else if (v == 6) {
    if (!downleft) {
      v = 32;
    }
  }
  else if (v == 9) {
    if (!upright) {
      v = 33;
    }
  }
  else if (v == 10) {
    if (!downright) {
      v = 34;
    }
  }
  else if (v == 7) {
    if (!downleft || !upleft) {
      v = 34;
      if (!downleft) {
        v++;
      }
      if (!upleft) {
        v += 2;
      }
    }
  }
  else if (v == 11) {
    if (!downright || !upright) {
      v = 37;
      if (!downright) {
        v++;
      }
      if (!upright) {
        v += 2;
      }
    }
  }
  else if (v == 13) {
    if (!upright || !upleft) {
      v = 40;
      if (!upright) {
        v++;
      }
      if (!upleft) {
        v += 2;
      }
    }
  }
  else if (v == 14) {
    if (!downright || !downleft) {
      v = 43;
      if (!downright) {
        v++;
      }
      if (!downleft) {
        v += 2;
      }
    }
  }

  return v + offset;
}
