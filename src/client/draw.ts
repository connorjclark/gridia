import { OutlineFilter } from '@pixi/filter-outline';
import Container from '../container';
import * as Content from '../content';
import { game } from '../game-singleton';
import * as Utils from '../utils';
import * as Helper from './helper';

export class GridiaWindow {
  public pixiContainer: PIXI.Container;
  public contents: PIXI.Container;
  private _onDraw?: () => void;

  constructor(pixiContainer: PIXI.Container) {
    this.pixiContainer = pixiContainer;
    this.contents = new PIXI.Container();
  }

  public setOnDraw(onDraw: () => void) {
    this._onDraw = onDraw;
  }

  public draw() {
    if (this._onDraw) this._onDraw();
  }
}

export class ContainerWindow extends GridiaWindow {
  public itemsContainer: Container;
  public mouseOverIndex?: number;
  protected _selectedIndex = 0;

  constructor(pixiContainer: PIXI.Container, itemsContainer: Container) {
    super(pixiContainer);
    this.itemsContainer = itemsContainer;
  }

  // Selected item actions are based off currently selected tool. If
  // the tool changes, should re-render the selected item panel.
  set selectedIndex(selectedIndex: number) {
    this._selectedIndex = selectedIndex;
    game.client.eventEmitter.emit('containerWindowSelectedIndexChanged');
  }

  get selectedIndex() { return this._selectedIndex; }
}

const containerWindows = new Map<number, ContainerWindow>();

const ResourceKeys: Record<string, string[]> = {
  creatures: [],
  floors: [],
  items: [],
  templates: [
    './world/templates/templates0.png',
  ],
};

for (let i = 0; i < 8; i++) {
  ResourceKeys.creatures.push(`./world/player/player${i}.png`);
}
for (let i = 0; i < 6; i++) {
  ResourceKeys.floors.push(`./world/floors/floors${i}.png`);
}
for (let i = 0; i < 27; i++) {
  ResourceKeys.items.push(`./world/items/items${i}.png`);
}

function convertToPixiLoaderEntries(keys: Record<string, string>): Array<{key: string, url: string}> {
  const entries = [];
  for (const [key, url] of Object.entries(keys)) {
    entries.push({key: key.toLowerCase(), url});
  }
  return entries;
}

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
const SfxResourceKeys = convertToPixiLoaderEntries(SfxKeys);

export function getImageResourceKeys() {
  return ResourceKeys;
}
export function getSfxResourceKeys() {
  return SfxResourceKeys;
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

export const getTexture = {
  creatures: makeTextureCache('creatures'),
  floors: makeTextureCache('floors'),
  items: makeTextureCache('items'),
  templates: makeTextureCache('templates'),
};

export function hasContainerWindow(containerId: number) {
  return containerWindows.has(containerId);
}

export function getContainerWindow(containerId: number) {
  return containerWindows.get(containerId);
}

export function setContainerWindow(containerId: number, containerWindow: ContainerWindow) {
  containerWindows.set(containerId, containerWindow);
}

export function getCanvasSize() {
  const canvasesEl = Helper.find('#canvases');
  // BoundingClientRect includes the border - which we don't want.
  // It causes an ever-increasing canvas on window resize.
  return {width: canvasesEl.clientWidth, height: canvasesEl.clientHeight};
}

export function makeDraggableWindow(): GridiaWindow {
  const borderSize = 10;

  const container = new PIXI.Container();
  container.interactive = true;
  const border = new PIXI.Graphics();
  border.interactive = true;
  container.addChild(border);

  const window = new GridiaWindow(container);
  const contents = window.contents;
  contents.interactive = true;
  contents.x = borderSize;
  contents.y = borderSize;
  container.addChild(contents);

  window.setOnDraw(() => {
    border.clear();
    border.beginFill(0, 0.2);
    border.lineStyle(borderSize, 0, 1, 0);
    border.drawRect(0, 0, contents.width + 2 * borderSize, contents.height + 2 * borderSize);
  });

  let dragging = false;
  let downAt = null;
  let startingPosition = null;
  const onDragBegin = (e: PIXI.interaction.InteractionEvent) => {
    // Only drag from the border.
    if (e.target !== border) return;

    dragging = true;
    downAt = { x: e.data.global.x, y: e.data.global.y };
    startingPosition = { x: container.x, y: container.y };
  };
  const onDrag = (e: PIXI.interaction.InteractionEvent) => {
    if (dragging) {
      container.x = startingPosition.x + e.data.global.x - downAt.x;
      container.y = startingPosition.y + e.data.global.y - downAt.y;

      const size = getCanvasSize();
      container.x = Utils.clamp(container.x, 0, size.width - container.width);
      container.y = Utils.clamp(container.y, 0, size.height - container.height);
    }
  };
  const onDragEnd = () => {
    dragging = false;
    downAt = null;
    startingPosition = null;
  };

  container.on('pointerdown', onDragBegin)
    .on('pointermove', onDrag)
    .on('pointerup', onDragEnd)
    .on('pointerupoutside', onDragEnd);

  return window;
}

export function makeItemContainerWindow(container: Container): ContainerWindow {
  const window = makeDraggableWindow();
  const containerWindow = new ContainerWindow(window.pixiContainer, container);

  let mouseDownIndex: number;

  window.contents
    .on('pointerdown', (e: PIXI.interaction.InteractionEvent) => {
      const x = e.data.getLocalPosition(e.target).x;
      const index = Math.floor(x / 32);
      if (!container.items[index]) return;
      mouseDownIndex = index;
      const evt: ItemMoveBeginEvent = {
        source: container.id,
        loc: { w: 0, x: index, y: 0, z: 0 },
        item: container.items[index] || undefined,
      };
      game.client.eventEmitter.emit('ItemMoveBegin', evt);
    })
    .on('pointermove', (e: PIXI.interaction.InteractionEvent) => {
      if (e.target !== window.contents) {
        containerWindow.mouseOverIndex = undefined;
        return;
      }

      const x = e.data.getLocalPosition(e.target).x;
      const index = Math.floor(x / 32);
      if (index >= 0 && index < container.items.length) {
        containerWindow.mouseOverIndex = index;
      } else {
        containerWindow.mouseOverIndex = undefined;
      }
    })
    .on('pointerup', (e: PIXI.interaction.InteractionEvent) => {
      if (containerWindow.mouseOverIndex !== undefined) {
        const evt: ItemMoveBeginEvent = {
          source: container.id,
          loc: { w: 0, x: containerWindow.mouseOverIndex, y: 0, z: 0 },
        };
        game.client.eventEmitter.emit('ItemMoveEnd', evt);
      }
      if (mouseDownIndex === containerWindow.mouseOverIndex) {
        containerWindow.selectedIndex = mouseDownIndex;
      }
    });

  if (container.id !== game.client.containerId) {
    game.client.eventEmitter.on('PlayerMove', close);
  }

  function close() {
    game.client.eventEmitter.removeListener('PlayerMove', close);
    game.removeWindow(containerWindow);
    containerWindows.delete(container.id);
    game.client.context.containers.delete(container.id);
  }

  containerWindow.setOnDraw(() => {
    // Hack: b/c container is requested multiple times, 'container' reference can get stale.
    const containerRef = game.client.context.containers.get(container.id);
    window.contents.removeChildren();
    for (const [i, item] of containerRef.items.entries()) {
      const itemSprite = makeItemSprite(item ? item : { type: 0, quantity: 1 });
      itemSprite.x = i * 32;
      itemSprite.y = 0;
      if (containerWindow.selectedIndex === i) {
        itemSprite.filters = [new OutlineFilter(1, 0xFFFF00, 1)];
      }
      window.contents.addChild(itemSprite);
    }

    if (containerWindow.mouseOverIndex !== null && game.state.mouse.state === 'down') {
      const mouseHighlight = makeHighlight(0xffff00, 0.3);
      mouseHighlight.x = 32 * containerWindow.mouseOverIndex;
      mouseHighlight.y = 0;
      window.contents.addChild(mouseHighlight);
    }

    window.draw();
  });

  // TODO: take actual positions of windows into account.
  window.pixiContainer.y = (containerWindows.size - 1) * 50;
  game.addWindow(containerWindow);
  return containerWindow;
}

export function makeUsageWindow(tool: Item, focus: Item, usages: ItemUse[], loc: TilePoint): GridiaWindow {
  const window = makeDraggableWindow();

  window.setOnDraw(() => {
    window.contents.removeChildren();
    for (const [i, usage] of usages.entries()) {
      const item = usage.products[0];
      const itemSprite = makeItemSprite(item);
      itemSprite.x = (i % 10) * 32;
      itemSprite.y = Math.floor(i / 10) * 32;
      window.contents.addChild(itemSprite);
    }

    window.draw();
  });

  window.contents
    .on('pointerdown', (e: PIXI.interaction.InteractionEvent) => {
      const {x, y} = e.data.getLocalPosition(e.target);
      const index = Math.floor(x / 32) + Math.floor(y / 32) * 10;
      close();
      Helper.useTool(loc, index);
    });

  game.client.eventEmitter.on('PlayerMove', close);

  function close() {
    game.client.eventEmitter.removeListener('PlayerMove', close);
    game.removeWindow(window);
  }

  window.pixiContainer.x = window.pixiContainer.y = 40;
  game.addWindow(window);
  return window;
}

export function makeHighlight(color: number, alpha: number) {
  const highlight = new PIXI.Graphics();
  highlight.beginFill(color, alpha);
  highlight.drawRect(0, 0, 32, 32);
  return highlight;
}

export function makeItemSprite(item: Item) {
  const meta = Content.getMetaItem(item.type);
  let texture = 1;
  if (meta.animations) {
    if (meta.animations.length === 1) {
      texture = meta.animations[0];
    } else if (meta.animations.length > 1) {
      const index = Math.floor((game.state.elapsedFrames * (60 / 1000)) % meta.animations.length);
      texture = meta.animations[index];
    }
  }
  const imgHeight = meta.imageHeight || 1;
  const sprite = new PIXI.Sprite(getTexture.items(texture, 1, imgHeight));
  sprite.anchor.y = (imgHeight - 1) / imgHeight;

  if (item.quantity !== 1) {
    const qty = text(item.quantity.toString(), {
      fontSize: 14,
      stroke: 0xffffff,
      strokeThickness: 4,
    });
    sprite.addChild(qty);
  }
  return sprite;
}

// Re-using Text objects avoids tons of expensive object allocations.
const TEXTS = {
  map: new Map<string, PIXI.Text>(),
  noId: [] as PIXI.Text[],
  pool: [] as PIXI.Text[],
};
export function pooledText(id: string, message: string, style: PIXI.TextStyleOptions): PIXI.Text {
  return _text(id, message, style);
}
export function text(message: string, style: PIXI.TextStyleOptions): PIXI.Text {
  return _text(undefined, message, style);
}
function _text(id: string | undefined, message: string, style: PIXI.TextStyleOptions): PIXI.Text {
  let textDisplay = id && TEXTS.map.get(id);
  if (textDisplay) {
    textDisplay.text = message;
  } else {
    textDisplay = TEXTS.pool.pop();
    if (textDisplay) {
      textDisplay.text = message;
      textDisplay.style = new PIXI.TextStyle(style);
    } else {
      textDisplay = new PIXI.Text(message, style);
    }
    if (id) TEXTS.map.set(id, textDisplay);
    else TEXTS.noId.push(textDisplay);
  }
  return textDisplay;
}

export function sweepTexts() {
  const stillOnStage = [];
  for (const textDisplay of TEXTS.noId) {
    if (game.isOnStage(textDisplay)) {
      stillOnStage.push(textDisplay);
    } else {
      TEXTS.pool.push(textDisplay);
    }
  }
  TEXTS.noId = stillOnStage;
}
