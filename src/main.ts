import { worldToTile } from './utils'
import { openAndConnectToServerInMemory } from './server'
import { ClientProtocolContext } from './context'
 
const items = require('../world/content/items.json')

console.log('items', items)

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

function main(gl, ctx) {
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

      const color = '#' + Math.round(tile.floor / 10 * 0xFFFFFF << 0).toString(16).padStart(6, '0')
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.beginPath();
      ctx.rect(sx, sy, 32, 32);
      ctx.fill();
      ctx.closePath();

      if (tile.item) {
        ctx.strokeStyle = ctx.fillStyle = "blue";
        ctx.beginPath();
        ctx.rect(sx + 8, sy + 8, 16, 16);
        ctx.fill();
        ctx.closePath();
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
  // ctx.beginPath();
  // ctx.closePath();

  if (state.mouse.state === 'down' && context.world.inBounds(state.mouse.downTile)) {
    const item = context.world.getItem(state.mouse.downTile)
    ctx.strokeStyle = ctx.fillStyle = "blue";
    ctx.beginPath();
    const { x, y } = state.mouse
    ctx.rect(x - 8, y - 8, 16, 16);
    ctx.fill();
    ctx.closePath();
  }
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
