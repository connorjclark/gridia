import * as PIXI from 'pixi.js';
import { MINE, WATER } from '../constants';
import Container from '../container';
import { getItemUses, getItemUsesForFocus, getItemUsesForProduct, getItemUsesForTool, getMetaItem } from '../items';
import { clamp, equalPoints, worldToTile as _worldToTile } from '../utils';
import Client from './client';
import { connect, openAndConnectToServerInMemory } from './connect-to-server';
import KEYS from './keys';

let wire: ClientToServerWire;

// pixi-sound needs to load after PIXI. The linter reorders imports in a way
// that breaks that requirement. So require here.
// @ts-ignore - https://github.com/pixijs/pixi-sound/issues/99
const PIXISound: typeof import('pixi-sound') = require('pixi-sound').default;

const client = new Client();
client.PIXI = PIXI;
client.PIXISound = PIXISound;

let lastMove = performance.now();
const state = {
  viewport: {
    x: 0,
    y: 0,
  },
  mouse: {
    x: 0,
    y: 0,
    tile: null as TilePoint,
    downTile: null as TilePoint,
    state: '',
  },
  selectedTile: null,
  keys: {},
  elapsedFrames: 0,
};

// @ts-ignore - for debugging
window.Gridia = {
  client,
  item(itemType: number) {
    console.log(getMetaItem(itemType));
    console.log('tool', getItemUsesForTool(itemType));
    console.log('focus', getItemUsesForFocus(itemType));
    console.log('product', getItemUsesForProduct(itemType));
  },
};

function convertToPixiLoaderEntries(keys): Array<{key: string, url: string}> {
  const entries = [];
  for (const [key, url] of Object.entries(keys)) {
    entries.push({key: key.toLowerCase(), url});
  }
  return entries;
}

const ResourceKeys = {
  creatures: [
    './world/player/player0.png',
  ],
  floors: [],
  items: [],
  templates: [
    './world/templates/templates0.png',
  ],
};

const SfxKeys = {
  beep: './world/sound/sfx/rpgwo/beep.WAV',
  BlowArrow: './world/sound/sfx/rpgwo/BlowArrow.WAV',
  bombtiq: './world/sound/sfx/rpgwo/bombtiq.wav',
  bubble: './world/sound/sfx/rpgwo/bubble.wav',
  burning: './world/sound/sfx/rpgwo/burning.wav',
  CaneSwish: './world/sound/sfx/rpgwo/CaneSwish.wav',
  CarpentryHammer: './world/sound/sfx/rpgwo/CarpentryHammer.wav',
  criket: './world/sound/sfx/rpgwo/criket.wav',
  Crossbow: './world/sound/sfx/rpgwo/Crossbow.wav',
  diescream: './world/sound/sfx/rpgwo/diescream.wav',
  digi_plink: './world/sound/sfx/rcptones/digi_plink.wav',
  door: './world/sound/sfx/rpgwo/door.wav',
  fishing: './world/sound/sfx/rpgwo/fishing.wav',
  harry: './world/sound/sfx/rpgwo/harry.wav',
  havenmayor: './world/sound/sfx/rpgwo/havenmayor.wav',
  heal: './world/sound/sfx/ff6/heal.wav',
  hiccup: './world/sound/sfx/rpgwo/hiccup.wav',
  ice: './world/sound/sfx/rpgwo/ice.WAV',
  pop_drip: './world/sound/sfx/rcptones/pop_drip.wav',
  punch: './world/sound/sfx/rpgwo/punch.wav',
  roll: './world/sound/sfx/zelda/roll.wav',
  Saw: './world/sound/sfx/rpgwo/Saw.wav',
  ShovelDig: './world/sound/sfx/rpgwo/ShovelDig.wav',
  smithinghammer: './world/sound/sfx/rpgwo/smithinghammer.wav',
  sparkly: './world/sound/sfx/rpgwo/sparkly.wav',
  warp: './world/sound/sfx/rpgwo/warp.wav',
  woodcutting: './world/sound/sfx/ryanconway/woodcutting.wav',
};

for (let i = 0; i < 6; i++) {
  ResourceKeys.floors.push(`./world/floors/floors${i}.png`);
}
for (let i = 0; i < 27; i++) {
  ResourceKeys.items.push(`./world/items/items${i}.png`);
}

function makeTextureCache(resourceType: string) {
  const textureCache = new Map<number, PIXI.Texture>();
  return (type: number, tilesWidth = 1, tilesHeight = 1) => {
    let texture = textureCache.get(type);
    if (texture) {
      return texture;
    }

    const textureIndex = Math.floor(type / 100);
    const resourceKey = ResourceKeys[resourceType][textureIndex];
    texture = new PIXI.Texture(
      PIXI.loader.resources[resourceKey].texture.baseTexture,
      new PIXI.Rectangle((type % 10) * 32, Math.floor((type % 100) / 10) * 32, tilesWidth * 32, tilesHeight * 32),
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
};

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
    // ts - ignore TouchEvent
    if (!('pageX' in e.data.originalEvent)) return;

    // Only drag from the border.
    if (e.target !== border) return;

    dragging = true;
    downAt = { x: e.data.originalEvent.pageX, y: e.data.originalEvent.pageY };
    startingPosition = { x: container.x, y: container.y };
  };
  const onDrag = (e: PIXI.interaction.InteractionEvent) => {
    // ts - ignore TouchEvent
    if (!('pageX' in e.data.originalEvent)) return;

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
    .on('mouseupoutside', onDragEnd);

  // TODO better names
  return {
    container,
    contents,
    draw,
  };
}

interface ItemMoveEvent {
  source: number;
  loc: TilePoint;
  item?: Item;
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
    _selectedIndex: 0,
    // Selected item actions are based off currently selected tool. If
    // the tool changes, should re-render the selected item panel.
    set selectedIndex(selectedIndex: number) {
      this._selectedIndex = selectedIndex;
      selectItem(state.selectedTile);
    },
    get selectedIndex() { return this._selectedIndex; },
  };

  let mouseDownIndex: number;

  window.contents
    .on('mousedown', (e: PIXI.interaction.InteractionEvent) => {
      const x = e.data.getLocalPosition(e.target).x;
      const index = Math.floor(x / 32);
      if (!container.items[index]) return;
      mouseDownIndex = index;
      const evt: ItemMoveEvent = {
        source: container.id,
        loc: { x: index, y: 0, z: 0 },
        item: container.items[index],
      };
      client.eventEmitter.emit('ItemMoveBegin', evt);
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
        const evt: ItemMoveEvent = {
          source: container.id,
          loc: { x: containerWindow.mouseOverIndex, y: 0, z: 0 },
        };
        client.eventEmitter.emit('ItemMoveEnd', evt);
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
      const mouseHighlight = makeHighlight(0xffff00, 0.3);
      mouseHighlight.x = 32 * containerWindow.mouseOverIndex;
      mouseHighlight.y = 0;
      window.contents.addChild(mouseHighlight);
    }

    const selectedHighlight = makeHighlight(0x00ff00, 0.5);
    selectedHighlight.x = 32 * containerWindow.selectedIndex;
    selectedHighlight.y = 0;
    window.contents.addChild(selectedHighlight);

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
  const imgHeight = meta.imageHeight || 1;
  const sprite = new PIXI.Sprite(getTexture.items(texture, 1, imgHeight));
  sprite.anchor.y = (imgHeight - 1) / imgHeight;

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

function renderSelectedItem(item: Item) {
  const el = document.querySelector('.selected-item');
  let data;
  let meta: MetaItem;
  if (item) {
    meta = getMetaItem(item.type);
    data = {
      name: meta.name,
      quantity: item.quantity,
      burden: item.quantity * meta.burden,
      misc: JSON.stringify(meta, null, 2),
    };
  } else {
    data = {
      name: '-',
      quantity: 0,
      burden: 0,
      misc: '',
    };
  }

  el.querySelector('.selected-item--name').innerHTML = `Item: ${data.name}`;
  el.querySelector('.selected-item--quantity').innerHTML = `Quantity: ${data.quantity}`;
  el.querySelector('.selected-item--burden').innerHTML = `Burden: ${data.burden}`;
  el.querySelector('.selected-item--misc').innerHTML = data.misc;

  const actionsEl = el.querySelector('.selected-item--actions');
  actionsEl.innerHTML = 'Actions:';

  if (!meta) return;

  const actions = [] as Array<{innerText: string, title: string, action: SelectedItemAction}>;

  if (meta.moveable) {
    actions.push({
      innerText: 'Pickup',
      title: 'Shortcut: Shift',
      action: 'pickup',
    });
  }

  if (canUseHand(item.type)) {
    actions.push({
      innerText: 'Use Hand',
      title: 'Shortcut: Alt',
      action: 'use-hand',
    });
  }

  if (state.selectedTile) {
    const tool = getSelectedTool();
    if (tool && usageExists(tool.type, item.type)) {
      actions.push({
        innerText: `Use ${getMetaItem(tool.type).name}`,
        title: 'Shortcut: Spacebar',
        action: 'use-tool',
      });
    }
  }

  for (const action of actions) {
    const actionEl = document.createElement('button');
    actionEl.innerText = action.innerText;
    actionEl.dataset.action = action.action;
    actionEl.title = action.title;
    actionsEl.appendChild(actionEl);
  }
}

type SelectedItemAction = 'pickup' | 'use-hand' | 'use-tool';

/**
 * @param {Event} e
 */
function onActionButtonClick(e) {
  const type: SelectedItemAction = e.target.dataset.action;

  switch (type) {
    case 'pickup':
      wire.send('moveItem', {
        from: state.mouse.downTile,
        fromSource: 0,
        to: null,
        toSource: client.containerId,
      });
      break;
    case 'use-hand':
      useHand(state.selectedTile);
      break;
    case 'use-tool':
      wire.send('use', {
        toolIndex: getSelectedToolIndex(),
        loc: state.selectedTile,
      });
      break;
    default:
      console.error('unknown action type', type);
    }
  // TODO: re-render selected item view when item changes.
}

function canUseHand(itemType: number) {
  return usageExists(0, itemType);
}

function usageExists(tool: number, focus: number) {
  return getItemUses(tool, focus).length !== 0;
}

function selectItem(loc: TilePoint | null) {
  state.selectedTile = loc;
  const item = loc ? client.context.map.getItem(loc) : null;
  renderSelectedItem(item);
}

function getZ() {
  const focusCreature = client.context.getCreature(client.creatureId);
  return focusCreature ? focusCreature.pos.z : 0;
}

function getSelectedTool() {
  const inventoryWindow = containerWindows.get(client.containerId);
  return inventoryWindow.container.items[inventoryWindow.selectedIndex];
}

function getSelectedToolIndex() {
  const inventoryWindow = containerWindows.get(client.containerId);
  return inventoryWindow.selectedIndex;
}

document.addEventListener('DOMContentLoaded', async () => {

  let connectOverSocket = !window.location.hostname.includes('localhost');
  if (window.location.search.includes('socket')) {
    connectOverSocket = true;
  } else if (window.location.search.includes('memory')) {
    connectOverSocket = false;
  }

  if (connectOverSocket) {
    wire = await connect(client, 9001);
  } else {
      const serverAndWire = openAndConnectToServerInMemory(client, {
        dummyDelay: 20,
        verbose: true,
      });
      wire = serverAndWire.clientToServerWire;
      // @ts-ignore debugging.
      Gridia.server = serverAndWire.server;

      setInterval(() => {
        serverAndWire.server.tick();
      }, 50);
  }

  PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
  const app = new PIXI.Application();

  const canvasesEl = document.body.querySelector('#canvases');
  canvasesEl.appendChild(app.view);

  document.querySelector('.selected-item--actions').addEventListener('click', onActionButtonClick);

  PIXI.loader
    .add(Object.values(ResourceKeys))
    .add(convertToPixiLoaderEntries(SfxKeys))
    .on('progress', (loader, resource) => console.log('loading ' + loader.progress + '%'))
    .load(() => {
      const world = new PIXI.Container();
      app.stage.addChild(world);

      const floorLayer = new PIXI.Container();
      world.addChild(floorLayer);

      const itemAndCreatureLayer = new PIXI.Container();
      world.addChild(itemAndCreatureLayer);

      const topLayer = new PIXI.Container();
      world.addChild(topLayer);

      world.interactive = true;
      world.on('mousedown', (e: PIXI.interaction.InteractionEvent) => {
        // ts - ignore TouchEvent
        if (!('pageX' in e.data.originalEvent)) return;

        const point = worldToTile(mouseToWorld({ x: e.data.originalEvent.pageX, y: e.data.originalEvent.pageY }));
        if (!client.context.map.inBounds(point)) return;
        const item = client.context.map.getItem(point);
        if (!item || !item.type) return;

        client.eventEmitter.emit('ItemMoveBegin', {
          source: 0,
          loc: state.mouse.tile,
          item,
        });
      });
      world.on('mouseup', (e: PIXI.interaction.InteractionEvent) => {
        // if (!itemMovingState) {
        //   const point = worldToTile(e.data.getLocalPosition(world));
        //   if (client.context.map.inBounds(point)) {
        //     client.context.map.getTile(point).floor = ++client.context.map.getTile(point).floor % 10;
        //   }
        // }

        const focusCreature = client.context.getCreature(client.creatureId);
        if (focusCreature && equalPoints(state.mouse.tile, focusCreature.pos)) {
          const evt: ItemMoveEvent = {
            source: client.containerId,
            loc: null,
          };
          client.eventEmitter.emit('ItemMoveEnd', evt);
        } else if (state.mouse.tile) {
          const evt: ItemMoveEvent = {
            source: 0,
            loc: state.mouse.tile,
          };
          client.eventEmitter.emit('ItemMoveEnd', evt);
        }
      });
      world.on('click', (e: PIXI.interaction.InteractionEvent) => {
        // ts - ignore TouchEvent
        if (!('pageX' in e.data.originalEvent)) return;

        const point = worldToTile(mouseToWorld({ x: e.data.originalEvent.pageX, y: e.data.originalEvent.pageY }));
        selectItem(point);
      });

      let itemMovingState: ItemMoveEvent = null;
      let mouseHasMoved = false;
      client.eventEmitter.on('ItemMoveBegin', (e: ItemMoveEvent) => {
        itemMovingState = e;
        mouseHasMoved = false;
        world.once('mousemove', () => {
          mouseHasMoved = true;
        });
      });
      client.eventEmitter.on('ItemMoveEnd', (e: ItemMoveEvent) => {
        if (!itemMovingState) return;

        wire.send('moveItem', {
          from: itemMovingState.loc,
          fromSource: itemMovingState.source,
          to: e.loc,
          toSource: e.source,
        });
        itemMovingState = null;
      });
      client.eventEmitter.on('message', (e) => {
        // TODO improve type checking.
        if (e.type === 'setItem') {
          const loc = {x: e.args.x, y: e.args.y, z: e.args.z};
          if (equalPoints(loc, state.selectedTile)) {
            selectItem(state.selectedTile);
          }
        }
      });

      app.ticker.add((delta) => {
        state.elapsedFrames = (state.elapsedFrames + 1) % 60000;

        const focusCreature = client.context.getCreature(client.creatureId);
        const focusPos = focusCreature ? focusCreature.pos : { x: 0, y: 0, z: 0 };
        const z = focusPos.z;

        if (!focusCreature) return;
        if (client.context.map.width === 0) return;

        // Draw container windows.
        for (const [id, container] of client.context.containers.entries()) {
          let containerWindow = containerWindows.get(id);
          if (!containerWindow) {
            containerWindow = makeItemContainerWindow(container);
            containerWindows.set(id, containerWindow);
            app.stage.addChild(containerWindow.window.container);

            // Inventory.
            if (id === client.containerId) {
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
        };

        const tilesWidth = Math.ceil(app.view.width / 32);
        const tilesHeight = Math.ceil(app.view.height / 32);
        const startTileX = Math.floor(state.viewport.x / 32);
        const startTileY = Math.floor(state.viewport.y / 32);
        const endTileX = startTileX + tilesWidth;
        const endTileY = startTileY + tilesHeight;

        floorLayer.removeChildren();
        for (let x = startTileX; x <= endTileX; x++) {
          for (let y = startTileY; y <= endTileY; y++) {
            const floor = client.context.map.getTile({ x, y, z }).floor;

            let sprite;
            if (floor === WATER) {
              const template = getWaterFloor({ x, y, z });
              sprite = new PIXI.Sprite(getTexture.templates(template));
            } else if (floor === MINE) {
              const template = getMineFloor({ x, y, z });
              sprite = new PIXI.Sprite(getTexture.templates(template));
            } else {
              sprite = new PIXI.Sprite(getTexture.floors(floor));
            }

            sprite.x = x * 32;
            sprite.y = y * 32;
            floorLayer.addChild(sprite);
          }
        }

        // TODO don't recreate all these sprites every frame. First pass here, but it's
        // is overcomplicated and not worth using yet.
        // const floorSpritesToRemove = new Set(Object.keys(floorLayer2.pointToSprite));
        // for (let x = startTileX; x <= endTileX; x++) {
        //   for (let y = startTileY; y <= endTileY; y++) {
        //     function makeSprite() {
        //       let sprite;
        //       if (floor === 1) {
        //         const template = getWaterFloor({ x, y });
        //         sprite = new PIXI.Sprite(getTexture.templates(template));
        //       } else {
        //         sprite = new PIXI.Sprite(getTexture.floors(floor));
        //       }

        //       sprite.x = x * 32;
        //       sprite.y = y * 32;
        //       floorLayer2.layer.addChild(sprite);
        //       floorLayer2.pointToSprite[`${x},${y}`] = {sprite, floor}
        //       return sprite;
        //     }

        //     const floor = client.world.getTile({ x, y }).floor;

        //     const currentSprite = floorLayer2.pointToSprite[`${x},${y}`];
        //     if (currentSprite) {
        //       floorSpritesToRemove.delete(`${x},${y}`);
        //       if (floor === currentSprite.floor) {
        //         continue;
        //       }
        //     }

        //     makeSprite();
        //   }
        // }
        // for (const key of floorSpritesToRemove) {
        //   floorLayer2.pointToSprite[key].sprite.destroy();
        //   delete floorLayer2.pointToSprite[key];
        // }

        itemAndCreatureLayer.removeChildren();
        for (let x = startTileX; x <= endTileX; x++) {
          for (let y = startTileY; y <= endTileY; y++) {
            const tile = client.context.map.getTile({ x, y, z });
            if (tile.item) {
              const itemSprite = makeItemSprite(tile.item);
              itemSprite.x = x * 32;
              itemSprite.y = y * 32;
              itemAndCreatureLayer.addChild(itemSprite);
            }

            if (tile.creature) {
              // TODO get more player images. (% 100)
              const creatureSprite = new PIXI.Sprite(getTexture.creatures(tile.creature.image % 100));
              creatureSprite.x = x * 32;
              creatureSprite.y = y * 32;
              itemAndCreatureLayer.addChild(creatureSprite);

              const label = new PIXI.Text(tile.creature.name,
                {fill: 'white', stroke: 'black', strokeThickness: 3, lineJoin: 'round', fontSize: 16});
              label.anchor.x = 0.5;
              label.anchor.y = 1;
              creatureSprite.addChild(label);
            }
          }
        }

        if (focusCreature && performance.now() - lastMove > 200) {
          const pos = { ...focusCreature.pos };
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
            selectItem(null);
            lastMove = performance.now();
            wire.send('move', pos);

            state.mouse.tile = null;
          }
        }

        topLayer.removeChildren();

        // Draw item being moved.
        if (itemMovingState && mouseHasMoved) {
          const itemSprite = makeItemSprite(itemMovingState.item);
          const { x, y } = mouseToWorld(state.mouse);
          itemSprite.x = x - 16;
          itemSprite.y = y - 16;
          topLayer.addChild(itemSprite);
        }

        // Draw selected highlight.
        if (state.selectedTile) {
          const selectedItem = client.context.map.getItem(state.selectedTile);
          const highlight = makeHighlight(0xffff00, 0.2);
          highlight.x = state.selectedTile.x * 32;
          highlight.y = state.selectedTile.y * 32;
          const tool = getSelectedTool();
          if (tool && selectedItem && usageExists(tool.type, selectedItem.type)) {
            const itemSprite = makeItemSprite({type: tool.type, quantity: 1});
            itemSprite.anchor.x = itemSprite.anchor.y = 0.5;
            highlight.addChild(itemSprite);
          }
          topLayer.addChild(highlight);
        }

        // Draw name of item under mouse.
        const itemUnderMouse = state.mouse.tile && client.context.map.getItem(state.mouse.tile);
        if (itemUnderMouse) {
          const meta = getMetaItem(itemUnderMouse.type);
          const text = itemUnderMouse.quantity === 1 ? meta.name : `${meta.name} (${itemUnderMouse.quantity})`;
          const label = new PIXI.Text(text, {fill: 'white', stroke: 'black', strokeThickness: 6, lineJoin: 'round'});
          const { x, y } = mouseToWorld(state.mouse);
          label.anchor.x = 0.5;
          label.anchor.y = 1;
          label.x = x;
          label.y = y - 8;
          topLayer.addChild(label);
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
    };
  });

  canvasesEl.addEventListener('mousedown', (e: MouseEvent) => {
    state.mouse = {
      ...state.mouse,
      state: 'down',
      downTile: state.mouse.tile,
    };
  });

  canvasesEl.addEventListener('mouseup', (e: MouseEvent) => {
    state.mouse = {
      ...state.mouse,
      state: 'up',
    };
  });

  document.onkeydown = (e) => {
    state.keys[e.keyCode] = true;
  };
  document.onkeyup = (e) => {
    delete state.keys[e.keyCode];

    const focusCreature = client.context.getCreature(client.creatureId);
    if (!focusCreature) return;
    const inventoryWindow = containerWindows.get(client.containerId);

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
      selectItem(state.selectedTile);
    }

    // Space bar to use tool.
    if (e.keyCode === KEYS.SPACE_BAR && state.selectedTile) {
      wire.send('use', {
        toolIndex: inventoryWindow.selectedIndex,
        loc: state.selectedTile,
      });
    }

    // Shift to pick up item.
    if (e.keyCode === KEYS.SHIFT && state.selectedTile) {
      wire.send('moveItem', {
        fromSource: 0,
        from: state.selectedTile,
        toSource: client.containerId,
        to: null,
      });
    }

    // Alt to use hand on item.
    if (e.key === 'Alt' && state.selectedTile) {
      useHand(state.selectedTile);
    }

    // T to toggle z.
    if (e.key === 't') {
      wire.send('move', {
        ...focusCreature.pos,
        z: 1 - focusCreature.pos.z,
      });
    }
  };

  // resize the canvas to fill browser window dynamically
  function resize() {
    const size = getCanvasSize();
    app.renderer.resize(size.width, size.height);
  }
  window.addEventListener('resize', resize);
  resize();
});

function worldToTile(pw: ScreenPoint) {
  return _worldToTile(pw, getZ());
}

function mouseToWorld(pm: ScreenPoint): ScreenPoint {
  return {
    x: pm.x + state.viewport.x,
    y: pm.y + state.viewport.y,
  };
}

function tileToScreen(pt: TilePoint): ScreenPoint {
  return {
    x: pt.x * 32 - state.viewport.x / 2,
    y: pt.y * 32 - state.viewport.y / 2,
  };
}

function getWaterFloor(point: TilePoint) {
  const templateIndex = useTemplate(0, WATER, point);
  return templateIndex;
}

function getMineFloor(point: TilePoint) {
  const templateIndex = useTemplate(1, MINE, point);
  return templateIndex;
}

// generalize
// this is only for floors right now
// more uses?
function useTemplate(templateId: number, typeToMatch: number, { x, y, z }: TilePoint) {
  // const width = client.world.width;
  // const height = client.world.height;
  // const xl = x == 0 ? width - 1 : x - 1;
  // const xr = x == width - 1 ? 0 : x + 1;
  // const yu = y == 0 ? height - 1 : y + 1;
  // const yd = y == height - 1 ? 0 : y - 1;
  const xl = x - 1;
  const xr = x + 1;
  const yu = y + 1;
  const yd = y - 1;

  function getTileOrFake(pos: TilePoint): Partial<{ floor: number }> {
    if (!client.context.map.inBounds(pos)) {
      return { floor: typeToMatch };
    }
    return client.context.map.getTile(pos);
  }

  const below = getTileOrFake({ x, y: yu, z }).floor === typeToMatch;
  const above = getTileOrFake({ x, y: yd, z }).floor === typeToMatch;
  const left = getTileOrFake({ x: xl, y, z }).floor === typeToMatch;
  const right = getTileOrFake({ x: xr, y, z }).floor === typeToMatch;

  const offset = templateId * 50;
  let v = (above ? 1 : 0) + (below ? 2 : 0) + (left ? 4 : 0) + (right ? 8 : 0);

  // this is where the complicated crap kicks in
  // i'd really like to replace this.
  // :'(
  // this is mostly guess work. I think. I wrote this code years ago. I know it works,
  // so I just copy and pasted. Shame on me.
  // ^ nov 2014
  // update: just copied this again here in dec 2018

  const downleft = getTileOrFake({ x: xl, y: yu, z }).floor === typeToMatch;
  const downright = getTileOrFake({ x: xr, y: yu, z }).floor === typeToMatch;
  const upleft = getTileOrFake({ x: xl, y: yd, z }).floor === typeToMatch;
  const upright = getTileOrFake({ x: xr, y: yd, z }).floor === typeToMatch;

  if (v === 15) {
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
  } else if (v === 5) {
    if (!upleft) {
      v = 31;
    }
  } else if (v === 6) {
    if (!downleft) {
      v = 32;
    }
  } else if (v === 9) {
    if (!upright) {
      v = 33;
    }
  } else if (v === 10) {
    if (!downright) {
      v = 34;
    }
  } else if (v === 7) {
    if (!downleft || !upleft) {
      v = 34;
      if (!downleft) {
        v++;
      }
      if (!upleft) {
        v += 2;
      }
    }
  } else if (v === 11) {
    if (!downright || !upright) {
      v = 37;
      if (!downright) {
        v++;
      }
      if (!upright) {
        v += 2;
      }
    }
  } else if (v === 13) {
    if (!upright || !upleft) {
      v = 40;
      if (!upright) {
        v++;
      }
      if (!upleft) {
        v += 2;
      }
    }
  } else if (v === 14) {
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

// Wire helpers.
function useHand(loc: TilePoint) {
  wire.send('use', {
    toolIndex: -1,
    loc,
  });
}
