import * as PIXI from 'pixi.js'
import KEYS from './keys'
import { worldToTile, equalPoints, clamp } from './utils'
import { openAndConnectToServerInMemory } from './server'
import { ClientWorldContext } from './context'
import { getMetaItem, getMetaItemByName } from './items'
import { EventEmitter } from 'events';
export class Client {
  creatureId: number
  world: ClientWorldContext
}

const client = new Client()
const wire = openAndConnectToServerInMemory(client)
const eventEmitter = new EventEmitter();

let lastMove = performance.now()
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
  },
  selectedTile: null,
  keys: {},
  elapsedFrames: 0,
}

// @ts-ignore - for debugging
window._client = client

const player = {
  sprite: null,
  lastMoved: 0,
}

const ResourceKeys = {
  creatures: [
    "../world/player/player0.png",
  ],
  floors: [],
  items: [],
  templates: [
    "../world/templates/templates0.png",
  ],
}

for (let i = 0; i < 6; i++) {
  ResourceKeys.floors.push(`../world/floors/floors${i}.png`);
}
for (let i = 0; i < 27; i++) {
  ResourceKeys.items.push(`../world/items/items${i}.png`);
}

function makeTextureCache(resourceType: string) {
  const textureCache = new Map<number, PIXI.Texture>();
  return (type: number) => {
    let texture = textureCache.get(type);
    if (texture) {
      return texture
    }

    const textureIndex = Math.floor(type / 100);
    const resourceKey = ResourceKeys[resourceType][textureIndex];
    texture = new PIXI.Texture(
      PIXI.loader.resources[resourceKey].texture.baseTexture,
      new PIXI.Rectangle((type % 10) * 32, Math.floor((type % 100) / 10) * 32, 32, 32)
    );
    textureCache.set(type, texture);
    return texture;
  };
}

const getTexture = {
  creatures: makeTextureCache('creatures'),
  floors: makeTextureCache('floors'),
  items: makeTextureCache('items'),
  templates: makeTextureCache('templates'),
}

function makeDraggableWindow() {
  const borderSize = 10;

  const container = new PIXI.Container();
  container.interactive = true;

  const border = new PIXI.Graphics();
  border.interactive = true;
  container.addChild(border);

  const contents = new PIXI.Container();
  contents.interactive = true;
  contents.x = borderSize;
  contents.y = borderSize;
  container.addChild(contents);

  let dragging = false;
  let downAt = null;
  let startingPosition = null;
  const onDragBegin = (e: PIXI.interaction.InteractionEvent) => {
    // Only drag from the border.
    if (e.target !== border) return;

    dragging = true;
    downAt = { x: e.data.originalEvent.pageX, y: e.data.originalEvent.pageY };
    startingPosition = { x: container.x, y: container.y };
  };
  const onDrag = (e: PIXI.interaction.InteractionEvent) => {
    if (dragging) {
      container.x = startingPosition.x + e.data.originalEvent.pageX - downAt.x;
      container.y = startingPosition.y + e.data.originalEvent.pageY - downAt.y;

      const size = getCanvasSize();
      container.x = clamp(container.x, 0, size.width - container.width);
      container.y = clamp(container.y, 0, size.height - container.height);
    }
  };
  const onDragEnd = () => {
    dragging = false;
    downAt = null;
    startingPosition = null;
  };

  function draw() {
    border.clear();
    border.beginFill(0, 0.2);
    border.lineStyle(borderSize, 0, 1, 0);
    border.drawRect(0, 0, contents.width + 2 * borderSize, contents.height + 2 * borderSize);
  }

  container.on('mousedown', onDragBegin)
    .on('mousemove', onDrag)
    .on('mouseup', onDragEnd)
    .on('mouseupoutside', onDragEnd)

  // TODO better names
  return {
    container,
    contents,
    draw,
  };
}

type ContainerWindow = ReturnType<typeof makeItemContainerWindow>;
const containerWindows = new Map<number, ContainerWindow>();
function makeItemContainerWindow(container: Container) {
  const window = makeDraggableWindow();
  const containerWindow = {
    window,
    container,
    draw,
    mouseOverIndex: null,
    selectedIndex: 0,
  };

  let mouseDownIndex;

  window.contents
    .on('mousedown', (e: PIXI.interaction.InteractionEvent) => {
      const x = e.data.getLocalPosition(e.target).x;
      const index = Math.floor(x / 32);
      if (!container.items[index]) return;
      mouseDownIndex = index;
      eventEmitter.emit('ItemMoveBegin', {
        source: container.id,
        loc: { x: index, y: 0 },
        item: container.items[index],
      });
    })
    .on('mousemove', (e: PIXI.interaction.InteractionEvent) => {
      if (e.target !== window.contents) {
        containerWindow.mouseOverIndex = null;
        return;
      }

      const x = e.data.getLocalPosition(e.target).x;
      const index = Math.floor(x / 32);
      if (index >= 0 && index < container.items.length) {
        containerWindow.mouseOverIndex = index;
      } else {
        containerWindow.mouseOverIndex = null;
      }
    })
    .on('mouseup', (e: PIXI.interaction.InteractionEvent) => {
      if (containerWindow.mouseOverIndex !== null) {
        eventEmitter.emit('ItemMoveEnd', {
          source: container.id,
          loc: { x: containerWindow.mouseOverIndex, y: 0 },
        });
      }
      if (mouseDownIndex === containerWindow.mouseOverIndex) {
        containerWindow.selectedIndex = mouseDownIndex;
      }
    });

  function draw() {
    window.contents.removeChildren();
    for (const [i, item] of container.items.entries()) {
      const itemSprite = makeItemSprite(item ? item : { type: 0, quantity: 1 });
      itemSprite.x = i * 32;
      itemSprite.y = 0;
      window.contents.addChild(itemSprite);
    }

    if (containerWindow.mouseOverIndex !== null && state.mouse.state === 'down') {
      const highlight = makeHighlight(0xffff00, 0.3);
      highlight.x = 32 * containerWindow.mouseOverIndex;
      highlight.y = 0;
      window.contents.addChild(highlight);
    }

    const highlight = makeHighlight(0x00ff00, 0.5);
    highlight.x = 32 * containerWindow.selectedIndex;
    highlight.y = 0;
    window.contents.addChild(highlight);

    window.draw();
  }

  return containerWindow;
}

function getCanvasSize() {
  const canvasesEl = document.body.querySelector('#canvases');
  return canvasesEl.getBoundingClientRect();
}

function makeHighlight(color: number, alpha: number) {
  const highlight = new PIXI.Graphics();
  highlight.beginFill(color, alpha);
  highlight.drawRect(0, 0, 32, 32);
  return highlight;
}

function makeItemSprite(item: Item) {
  const meta = getMetaItem(item.type);
  let texture = 1;
  if (meta.animations) {
    if (meta.animations.length === 1) {
      texture = meta.animations[0];
    } else if (meta.animations.length > 1) {
      const index = Math.floor((state.elapsedFrames * (60 / 1000)) % meta.animations.length);
      texture = meta.animations[index];
    }
  }
  const sprite = new PIXI.Sprite(getTexture.items(texture));
  if (item.quantity !== 1) {
    const qty = new PIXI.Text(item.quantity.toString(), {
      fontSize: 14,
      stroke: 0xffffff,
      strokeThickness: 4,
    });
    sprite.addChild(qty);
  }
  return sprite;
}

document.addEventListener("DOMContentLoaded", () => {
  PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
  const app = new PIXI.Application();

  const canvasesEl = document.body.querySelector('#canvases');
  canvasesEl.appendChild(app.view);

  PIXI.loader
    .add(Object.values(ResourceKeys))
    .on("progress", (loader, resource) => console.log('loading ' + loader.progress + "%"))
    .load(() => {
      const world = new PIXI.Container();
      app.stage.addChild(world);

      const floorLayer = new PIXI.Container();
      world.addChild(floorLayer);

      const itemLayer = new PIXI.Container();
      world.addChild(itemLayer);

      const topLayer = new PIXI.Container();
      world.addChild(topLayer);

      world.interactive = true;
      world.on('mousedown', (e: PIXI.interaction.InteractionEvent) => {
        const point = worldToTile(mouseToWorld({ x: e.data.originalEvent.pageX, y: e.data.originalEvent.pageY }));
        if (!client.world.inBounds(point)) return;
        const item = client.world.getItem(point);
        if (!item || !item.type) return;

        eventEmitter.emit('ItemMoveBegin', {
          source: 0,
          loc: state.mouse.tile,
          item,
        });
      });
      world.on('mouseup', (e: PIXI.interaction.InteractionEvent) => {
        if (!itemMovingState) {
          const point = worldToTile(e.data.getLocalPosition(world));
          if (client.world.inBounds(point)) {
            client.world.getTile(point).floor = ++client.world.getTile(point).floor % 10
          }
        }

        const focusCreature = client.world.getCreature(client.creatureId);
        if (focusCreature && equalPoints(state.mouse.tile, focusCreature.pos)) {
          eventEmitter.emit('ItemMoveEnd', {
            source: focusCreature.containerId,
            loc: null,
          });
        } else if (state.mouse.tile) {
          eventEmitter.emit('ItemMoveEnd', {
            source: 0,
            loc: state.mouse.tile,
          });
        }
      });

      let itemMovingState = null;
      eventEmitter.on('ItemMoveBegin', e => {
        itemMovingState = e;
      });
      eventEmitter.on('ItemMoveEnd', e => {
        if (!itemMovingState) return;

        wire.send('moveItem', {
          from: itemMovingState.loc,
          fromSource: itemMovingState.source,
          to: e.loc,
          toSource: e.source,
        });
        itemMovingState = null;
      });

      // TODO make creature layer

      app.ticker.add(delta => {
        state.elapsedFrames = (state.elapsedFrames + 1) % 60000;

        const focusCreature = client.world.getCreature(client.creatureId);
        const focusPos = focusCreature ? focusCreature.pos : { x: 0, y: 0 };

        if (!focusCreature) return;

        // Draw container windows.
        for (const [id, container] of client.world.containers.entries()) {
          let containerWindow = containerWindows.get(id);
          if (!containerWindow) {
            containerWindow = makeItemContainerWindow(container);
            containerWindows.set(id, containerWindow);
            app.stage.addChild(containerWindow.window.container);

            // Inventory.
            if (id === focusCreature.containerId) {
              containerWindow.draw();
              const size = getCanvasSize();
              containerWindow.window.container.x = size.width / 2 - containerWindow.window.container.width / 2;
              containerWindow.window.container.y = size.height - containerWindow.window.container.height;
            }
          }

          containerWindow.draw();
        }

        state.viewport = {
          x: focusPos.x * 32 - app.view.width / 2,
          y: focusPos.y * 32 - app.view.height / 2,
        }

        const tilesWidth = Math.ceil(app.view.width / 32);
        const tilesHeight = Math.ceil(app.view.height / 32);
        const startTileX = Math.floor(state.viewport.x / 32);
        const startTileY = Math.floor(state.viewport.y / 32);
        const endTileX = startTileX + tilesWidth;
        const endTileY = startTileY + tilesHeight;

        floorLayer.removeChildren();
        for (let x = startTileX; x <= endTileX; x++) {
          for (let y = startTileY; y <= endTileY; y++) {
            const floor = client.world.getTile({ x, y }).floor;

            let sprite;
            if (floor === 1) {
              const template = getWaterFloor({ x, y })
              sprite = new PIXI.Sprite(getTexture.templates(template));
            } else {
              sprite = new PIXI.Sprite(getTexture.floors(floor));
            }

            sprite.x = x * 32;
            sprite.y = y * 32;
            floorLayer.addChild(sprite);
          }
        }

        itemLayer.removeChildren();
        for (let x = startTileX; x <= endTileX; x++) {
          for (let y = startTileY; y <= endTileY; y++) {
            const item = client.world.getTile({ x, y }).item;
            if (item) {
              const itemSprite = makeItemSprite(item);
              itemSprite.x = x * 32;
              itemSprite.y = y * 32;
              itemLayer.addChild(itemSprite);
            }
          }
        }

        if (focusCreature) {
          player.sprite = new PIXI.Sprite(getTexture.creatures(focusCreature.image));
          player.sprite.x = 32 * focusPos.x;
          player.sprite.y = 32 * focusPos.y;
          itemLayer.addChild(player.sprite);
        }

        if (focusCreature && performance.now() - lastMove > 200) {
          const pos = { ...focusCreature.pos }
          if (state.keys[KEYS.W]) {
            pos.y -= 1;
          } else if (state.keys[KEYS.S]) {
            pos.y += 1;
          }
          if (state.keys[KEYS.A]) {
            pos.x -= 1;
          } else if (state.keys[KEYS.D]) {
            pos.x += 1;
          }

          if (pos.x !== focusCreature.pos.x || pos.y !== focusCreature.pos.y) {
            state.selectedTile = null;
            lastMove = performance.now()
            wire.send('move', pos)
          }
        }

        topLayer.removeChildren();

        // Draw item being moved.
        if (itemMovingState) {
          const itemSprite = makeItemSprite(itemMovingState.item);
          const { x, y } = mouseToWorld(state.mouse);
          itemSprite.x = x - 16;
          itemSprite.y = y - 16;
          topLayer.addChild(itemSprite);
        }

        // Draw selected highlight.
        if (state.selectedTile) {
          const highlight = makeHighlight(0xffff00, 0.2);
          highlight.x = state.selectedTile.x * 32;
          highlight.y = state.selectedTile.y * 32;
          const inventoryWindow = containerWindows.get(focusCreature.containerId);
          const item = inventoryWindow.container.items[inventoryWindow.selectedIndex];
          if (item) {
            const itemSprite = makeItemSprite(item);
            itemSprite.anchor.x = itemSprite.anchor.y = 0.5;
            highlight.addChild(itemSprite);
          }
          topLayer.addChild(highlight);
        }

        world.x = -focusPos.x * 32 + Math.floor(app.view.width / 2);
        world.y = -focusPos.y * 32 + Math.floor(app.view.height / 2);
      });
    });

  canvasesEl.addEventListener('mousemove', (e: MouseEvent) => {
    state.mouse = {
      ...state.mouse,
      x: e.clientX,
      y: e.clientY,
      tile: worldToTile(mouseToWorld({ x: e.clientX, y: e.clientY })),
    }
  });

  canvasesEl.addEventListener('mousedown', (e: MouseEvent) => {
    state.mouse = {
      ...state.mouse,
      state: 'down',
      downTile: state.mouse.tile,
    }
  });

  canvasesEl.addEventListener('mouseup', (e: MouseEvent) => {
    state.mouse = {
      ...state.mouse,
      state: 'up',
    }
  });

  document.onkeydown = (e) => {
    state.keys[e.keyCode] = true;
  }
  document.onkeyup = (e) => {
    delete state.keys[e.keyCode];

    const focusCreature = client.world.getCreature(client.creatureId);
    if (!focusCreature) return;
    const inventoryWindow = containerWindows.get(focusCreature.containerId);

    // Number keys for selecting tool in inventory.
    if (e.keyCode >= KEYS.ZERO && e.keyCode <= KEYS.NINE) {
      const num = e.keyCode - KEYS.ZERO;

      // 1234567890
      if (num === 0) {
        inventoryWindow.selectedIndex = 9;
      } else {
        inventoryWindow.selectedIndex = num - 1;
      }
      inventoryWindow.draw();
    }

    // Arrow keys for selecting tile in world.
    let dx = 0, dy = 0;
    if (e.keyCode === KEYS.UP_ARROW) {
      dy -= 1;
    } else if (e.keyCode === KEYS.DOWN_ARROW) {
      dy += 1;
    }
    if (e.keyCode === KEYS.LEFT_ARROW) {
      dx -= 1;
    } else if (e.keyCode === KEYS.RIGHT_ARROW) {
      dx += 1;
    }

    if (dx || dy) {
      state.selectedTile = state.selectedTile || { ...focusCreature.pos };
      state.selectedTile.x += dx;
      state.selectedTile.y += dy;
    }

    // Space bar to use tool.
    if (e.keyCode === KEYS.SPACE_BAR && state.selectedTile) {
      wire.send('use', {
        toolIndex: inventoryWindow.selectedIndex,
        loc: state.selectedTile,
      })
    }
  }

  // resize the canvas to fill browser window dynamically
  function resize() {
    const size = getCanvasSize();
    app.renderer.resize(size.width, size.height);
  }
  window.addEventListener('resize', resize);
  resize();
})

function mouseToWorld(pm: Point): Point {
  return {
    x: pm.x + state.viewport.x,
    y: pm.y + state.viewport.y,
  };
}

function tileToScreen(pt: Point): Point {
  return {
    x: pt.x * 32 - state.viewport.x / 2,
    y: pt.y * 32 - state.viewport.y / 2,
  }
}

function getWaterFloor(point: Point) {
  const templateIndex = useTemplate(0, 1, point)
  return templateIndex;
}

// generalize
// this is only for floors right now
// more uses?
function useTemplate(templateId: number, typeToMatch: number, { x, y }: Point) {
  const z = 0;

  var size = client.world.size;
  // var xl = x == 0 ? size - 1 : x - 1;
  // var xr = x == size - 1 ? 0 : x + 1;
  // var yu = y == 0 ? size - 1 : y + 1;
  // var yd = y == size - 1 ? 0 : y - 1;
  var xl = x - 1;
  var xr = x + 1
  var yu = y + 1
  var yd = y - 1

  function getTileOrFake(pos: Point): Partial<{ floor: number }> {
    if (!client.world.inBounds(pos)) {
      return { floor: typeToMatch }
    }
    return client.world.getTile(pos)
  }

  var below = getTileOrFake({ x, y: yu, z }).floor == typeToMatch;
  var above = getTileOrFake({ x, y: yd, z }).floor == typeToMatch;
  var left = getTileOrFake({ x: xl, y, z }).floor == typeToMatch;
  var right = getTileOrFake({ x: xr, y, z }).floor == typeToMatch;

  var offset = templateId * 50;
  var v = (above ? 1 : 0) + (below ? 2 : 0) + (left ? 4 : 0) + (right ? 8 : 0);

  // this is where the complicated crap kicks in
  // i'd really like to replace this.
  // :'(
  // this is mostly guess work. I think. I wrote this code years ago. I know it works,
  // so I just copy and pasted. Shame on me.
  // ^ nov 2014
  // update: just copied this again here in dec 2018

  var downleft = getTileOrFake({ x: xl, y: yu, z }).floor == typeToMatch;
  var downright = getTileOrFake({ x: xr, y: yu, z }).floor == typeToMatch;
  var upleft = getTileOrFake({ x: xl, y: yd, z }).floor == typeToMatch;
  var upright = getTileOrFake({ x: xr, y: yd, z }).floor == typeToMatch;

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
