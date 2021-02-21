import { GFX_SIZE } from '../constants';
import * as Content from '../content';
import { game } from '../game-singleton';
import * as Utils from '../utils';
import * as Helper from './helper';
import { ImageResources } from './lazy-resource-loader';

export function destroyChildren(displayObject: PIXI.Container) {
  if (displayObject.children.length === 0) return;

  for (const child of [...displayObject.children]) {
    // if (child instanceof PIXI.Container) {
    // child.destroy({children: true});
    // } else {
    child.destroy();
    // }
  }
}

export class GridiaWindow {
  pixiContainer: PIXI.Container;
  border: PIXI.Graphics;
  borderSize = 10;
  contents: PIXI.Container;
  private _onDraw?: () => void;

  private _draggingState?: { downAt: Point2; startingPosition: Point2 };

  constructor() {
    this.pixiContainer = new PIXI.Container();
    this.border = new PIXI.Graphics();
    this.border.interactive = true;
    this.pixiContainer.addChild(this.border);

    this.contents = new PIXI.Container();
    this.contents.interactive = true;
    this.contents.x = this.borderSize;
    this.contents.y = this.borderSize;
    this.pixiContainer.addChild(this.contents);

    this.border
      .on('pointerdown', this._onDragBegin.bind(this))
      .on('pointermove', this._onDrag.bind(this))
      .on('pointerup', this._onDragEnd.bind(this))
      .on('pointerupoutside', this._onDragEnd.bind(this));
  }

  setOnDraw(onDraw: () => void) {
    this._onDraw = onDraw;
  }

  draw() {
    if (this._onDraw) this._onDraw();
    this.border.clear();
    this.border.beginFill(0, 0.2);
    this.border.lineStyle(this.borderSize, 0, 1, 0);
    this.border.drawRect(0, 0, this.contents.width + 2 * this.borderSize, this.contents.height + 2 * this.borderSize);
  }

  get width() {
    return this.pixiContainer.width;
  }

  get height() {
    return this.pixiContainer.height;
  }

  private _onDragBegin(e: PIXI.InteractionEvent) {
    this._draggingState = {
      startingPosition: { x: this.pixiContainer.x, y: this.pixiContainer.y },
      downAt: { x: e.data.global.x, y: e.data.global.y },
    };
  }

  private _onDrag(e: PIXI.InteractionEvent) {
    if (!this._draggingState) return;

    this.pixiContainer.x = this._draggingState.startingPosition.x + e.data.global.x - this._draggingState.downAt.x;
    this.pixiContainer.y = this._draggingState.startingPosition.y + e.data.global.y - this._draggingState.downAt.y;

    const size = getCanvasSize();
    this.pixiContainer.x = Utils.clamp(this.pixiContainer.x, 0, size.width - this.width);
    this.pixiContainer.y = Utils.clamp(this.pixiContainer.y, 0, size.height - this.height);
  }

  private _onDragEnd() {
    this._draggingState = undefined;
  }
}

function makeTextureCache(resourceType: string) {
  const textureCache = new Map<number, PIXI.Texture>();
  return (type: number, tilesWidth = 1, tilesHeight = 1) => {
    let texture = textureCache.get(type);
    if (texture) {
      return texture;
    }

    const textureIndex = Math.floor(type / 100);
    const resourceKey = ImageResources[resourceType][textureIndex];

    if (!game.loader.hasResourceLoaded(resourceKey)) {
      game.loader.loadResource(resourceKey);
      return PIXI.Texture.EMPTY;
    }

    const rect = new PIXI.Rectangle(
      (type % 10) * GFX_SIZE, Math.floor((type % 100) / 10) * GFX_SIZE, tilesWidth * GFX_SIZE, tilesHeight * GFX_SIZE);
    texture = new PIXI.Texture(PIXI.Loader.shared.resources[resourceKey].texture.baseTexture, rect);
    textureCache.set(type, texture);
    return texture;
  };
}

export const getTexture = {
  animations: makeTextureCache('animations'),
  creatures: makeTextureCache('creatures'),
  floors: makeTextureCache('floors'),
  items: makeTextureCache('items'),
  templates: makeTextureCache('templates'),
};

export function getCanvasSize() {
  const canvasesEl = Helper.find('#canvases');
  // BoundingClientRect includes the border - which we don't want.
  // It causes an ever-increasing canvas on window resize.
  return { width: canvasesEl.clientWidth, height: canvasesEl.clientHeight };
}

export function makeHighlight(color: number, alpha: number) {
  const highlight = new PIXI.Graphics();
  highlight.beginFill(color, alpha);
  highlight.drawRect(0, 0, GFX_SIZE, GFX_SIZE);
  return highlight;
}

export function makeAnimationSprite(animationIndices: number[]) {
  const textures = animationIndices.map((index) => getTexture.animations(index));
  const anim = new PIXI.AnimatedSprite(textures);
  return anim;
}

export function makeItemTemplate(item: Item) {
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
  return getTexture.items(texture, 1, imgHeight);
}

export function makeItemQuantity(quantity: number) {
  return text(quantity.toString(), {
    fontSize: 14,
    stroke: 0xffffff,
    strokeThickness: 4,
  });
}

export function makeItemSprite(item: Item) {
  const tex = makeItemTemplate(item);

  let sprite;
  if (tex.height > GFX_SIZE) {
    sprite = new PIXI.Sprite();
    sprite.addChild(new PIXI.Sprite(tex)).y = GFX_SIZE - tex.height;
  } else {
    sprite = new PIXI.Sprite(tex);
  }

  // TODO: something like this would allow for tall item in inventory. but unclear if that is a good idea.
  // sprite.anchor.y = (imgHeight - 1) / imgHeight;
  if (item.quantity !== 1) {
    sprite.addChild(makeItemQuantity(item.quantity));
  }

  return sprite;
}

// Returns null if some texture is not loaded yet, so that it doesn't get cached.
export function makeItemSprite2(item: Item) {
  function make() {
    const meta = Content.getMetaItem(item.type);

    if (!meta.animations) {
      return new PIXI.Sprite();
    }

    if (meta.animations.length === 1) {
      const texture = getTexture.items(meta.animations[0], 1, meta.imageHeight || 1);
      if (texture === PIXI.Texture.EMPTY) return null;
      return new PIXI.Sprite(texture);
    }

    const textures = [];
    for (const frame of meta.animations) {
      const texture = getTexture.items(frame, 1, meta.imageHeight || 1);
      if (texture === PIXI.Texture.EMPTY) return null;
      textures.push(texture);
    }

    const anim = new PIXI.AnimatedSprite(textures, true);
    anim.animationSpeed = 0.1;
    anim.play();
    return anim;
  }

  const sprite = make();
  if (!sprite) return;

  // TODO: fix layering...
  // if (sprite.texture.height > GFX_SIZE) {
  //   const wrapperSprite = new PIXI.Sprite();
  //   console.log(sprite.texture.height);
  //   wrapperSprite.addChild(sprite).y = GFX_SIZE - sprite.texture.height;
  //   sprite = wrapperSprite;
  // }
  if (sprite.texture.height > GFX_SIZE) {
    sprite.anchor.y = 0.5;
  }

  if (item.quantity !== 1) {
    const label = makeItemQuantity(item.quantity);
    sprite.addChild(label);
  }

  return sprite;
}

// TODO delete?
// abstract class SpriteTileMap extends PIXI.Container {
//   protected positionToSpriteMap = new Map<string, {pos: Point2, sprite: PIXI.Sprite, hash: string}>();

//   constructor(protected tileSize: number) {
//     super();
//   }

//   abstract getHash(tile: Tile): string;
//   abstract makeSprite(tile: Tile): PIXI.Sprite | null;

//   set(pos: Point2, tile: Tile) {
//     const key = `${pos.x},${pos.y}`;
//     const data = this.positionToSpriteMap.get(key);
//     const hash = this.getHash(tile);
//     const isInvalid = !data || data.hash !== hash;
//     if (!isInvalid) return;

//     if (data) this.removeChild(data.sprite);
//     const sprite = this.makeSprite(tile);
//     if (!sprite) return;

//     sprite.x = pos.x * this.tileSize;
//     sprite.y = pos.y * this.tileSize;
//     this.addChild(sprite);
//     this.positionToSpriteMap.set(key, {pos, sprite, hash});
//   }

//   invalidateOutsideRegion(start: Point2, width: number, height: number) {
//     const end = {x: start.x + width, y: start.y + height};
//     for (const [key, {pos, sprite}] of this.positionToSpriteMap.entries()) {
//       const inBounds = pos.x >= start.x && pos.x <= end.x && pos.y >= start.y && pos.y <= end.y;
//       if (inBounds) continue;
//       this.positionToSpriteMap.delete(key);
//       this.removeChild(sprite);
//     }
//   }
// }

// export class ItemTileMap extends SpriteTileMap {
//   getHash(tile: Tile): string {
//     if (!tile.item) return '';
//     return `${tile.item.type},${tile.item.quantity}`
//   }
//   makeSprite(tile: Tile): PIXI.Sprite | null {
//     if (!tile.item) return null;
//     return makeItemSprite2(tile.item);
//   }
// }

// Re-using Text objects avoids tons of expensive object allocations.
const TEXTS = {
  map: new Map<string, PIXI.Text>(),
  noId: [] as PIXI.Text[],
  pool: [] as PIXI.Text[],
};
export function pooledText(id: string, message: string, style: Partial<PIXI.TextStyle>): PIXI.Text {
  return _text(id, message, style);
}
export function text(message: string, style: Partial<PIXI.TextStyle>): PIXI.Text {
  return _text(undefined, message, style);
}
function _text(id: string | undefined, message: string, style: Partial<PIXI.TextStyle>): PIXI.Text {
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
