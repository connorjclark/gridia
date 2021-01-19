import { GFX_SIZE, MINE, WATER } from '../constants';
import * as Content from '../content';
import { game } from '../game-singleton';
import { Visibility } from '../lib/visibility';
import * as Utils from '../utils';
import WorldMap from '../world-map';
import * as Draw from './draw';
import { getMineItem, getWaterFloor } from './template-draw';

const MAX_LIGHT_POWER = 6;

interface Animation {
  location: Point4;
  tint: number;
  /** Alpha of tint. */
  alpha: number;
  /** Decrease alpha per tick. */
  decay: number;
  light: number;
  frames?: GridiaAnimation['frames'];
}

interface Emitter {
  tint: number;
  path: Point2[];
  offshootRate?: number;
  light?: number;
  frames?: GridiaAnimation['frames'];
}

type LightResult = Array2D<{ light: number; tint?: number; alpha?: number }>;

class WorldAnimationController {
  public emitters: Emitter[] = [];
  public animations: Animation[] = [];

  public constructor(private worldContainer: WorldContainer) { }

  public addEmitter(emitter: Emitter) {
    // Don't emit sounds for every animation created. Instead,
    // create an invisible animation for just the sounds, so that
    // it only plays once.
    if (emitter.frames) {
      this.addAnimation({
        location: { ...this.worldContainer.camera.focus, ...emitter.path[0] },
        frames: emitter.frames.map((frame) => ({
          sprite: 0,
          sound: frame.sound,
        })),
        tint: 0,
        alpha: 0,
        decay: 0,
        light: 0,
      });
      emitter.frames = emitter.frames.map((frame) => ({
        sprite: frame.sprite,
      }));
    }

    this.emitters.push(emitter);
  }

  public addAnimation(animation: Animation) {
    if (animation.tint) this.animations.push(animation);

    if (animation.frames) {
      const sprite = Draw.makeAnimationSprite(animation.frames.map((frame) => frame.sprite));
      sprite.animationSpeed = 5 / 60;
      sprite.loop = false;
      sprite.x = animation.location.x * GFX_SIZE;
      sprite.y = animation.location.y * GFX_SIZE;
      sprite.onFrameChange = () => {
        const sound = animation.frames && animation.frames[sprite.currentFrame].sound;
        if (sound) game.playSound(sound);
      };
      sprite.onFrameChange();
      sprite.onComplete = () => sprite.destroy();

      const container = this.worldContainer.layers.animations;
      container.addChild(sprite);

      sprite.play();
    }
  }

  public tick() {
    for (const emitter of [...this.emitters]) {
      const cur = emitter.path.pop();
      if (!cur) {
        this.emitters.splice(this.emitters.indexOf(emitter), 1);
      } else {
        this.addAnimation({
          tint: emitter.tint,
          location: { ...this.worldContainer.camera.focus, x: cur.x, y: cur.y },
          alpha: 0.3,
          decay: 0.01,
          light: emitter.light || 0,
          frames: emitter.frames,
        });

        if (emitter.offshootRate && Math.random() < emitter.offshootRate) {
          this.emitters.push({
            tint: emitter.tint,
            path: [{ x: cur.x + Utils.randInt(-1, 1), y: cur.y + Utils.randInt(-1, 1) }],
            offshootRate: emitter.offshootRate / 2,
            light: emitter.light,
          });
        }
      }
    }

    for (const animation of [...this.animations]) {
      animation.alpha -= animation.decay;
      if (animation.alpha <= 0) {
        this.animations.splice(this.animations.indexOf(animation), 1);
      }
    }
  }
}

class Camera {
  public left = 0;
  public top = 0;
  public width = 0;
  public height = 0;
  // If 0, camera will be centered on player.
  // TODO: change to "center boundrary".
  public edgeBoundary = 10;
  public focus: Point4 = { w: 0, x: 0, y: 0, z: 0 };

  public get right() {
    return this.left + this.width;
  }
  public get bottom() {
    return this.top + this.height;
  }

  public constructor(private worldContainer: WorldContainer) { }

  /**
   * Adjusts `camera.left` and `camera.top` if necessary to maintain `camera.edgeBoundary` constraint.
   * If new camera focus is much different from previous, center the camera on the new focus location.
   *
   * @param loc New location of camera focus (example: player location).
   */
  public adjustFocus(loc: Point4) {
    const shouldCenter = this.focus.w !== loc.w || this.focus.z !== loc.z || Utils.dist(loc, this.focus) >= 20;

    this.focus = { ...loc };

    let edgeBoundary = this.edgeBoundary;
    if (edgeBoundary >= this.width / 2 || edgeBoundary >= this.height / 2) edgeBoundary = 0;

    if (edgeBoundary) {
      if (loc.x - this.left < edgeBoundary) {
        this.left = loc.x - edgeBoundary;
      } else if (this.width - (loc.x - this.left) - 1 < edgeBoundary) {
        this.left = edgeBoundary - (this.width - loc.x) + 1;
      }

      if (loc.y - this.top < edgeBoundary) {
        this.top = loc.y - edgeBoundary;
      } else if (this.height - (loc.y - this.top) - 1 < edgeBoundary) {
        this.top = edgeBoundary - (this.height - loc.y) + 1;
      }
    } else {
      const centerX = Math.floor(this.width / 2);
      const centerY = Math.floor(this.height / 2);
      this.left = loc.x - centerX;
      this.top = loc.y - centerY;
    }

    const partition = this.worldContainer.map.getPartition(loc.w);
    const maxLeft = partition.width - this.width;
    const maxTop = partition.height - this.height;
    this.left = Utils.clamp(this.left, 0, maxLeft);
    this.top = Utils.clamp(this.top, 0, maxTop);

    if (shouldCenter) this.center();
  }

  public center() {
    const edgeBoundary = this.edgeBoundary;
    this.edgeBoundary = 0;
    this.adjustFocus(this.focus);
    this.edgeBoundary = edgeBoundary;
    this.adjustFocus(this.focus);
  }
}

export class WorldContainer extends PIXI.Container {
  public layers = {
    floors: new PIXI.Container(),
    grid: new PIXI.Container(),
    items: new PIXI.Container(),
    creatures: new PIXI.Container(),
    animations: new PIXI.Container(),
    tint: new PIXI.Container(),
    light: new PIXI.Container(),
    top: new PIXI.Container(),
  };

  public camera = new Camera(this);

  public animationController = new WorldAnimationController(this);

  public ambientLight = 0;

  private tiles = new Map<string, Tile>();

  public constructor(public map: WorldMap) {
    super();

    this.layers.items = this.layers.creatures;
    this.layers.items.sortableChildren = true;

    this.drawGrid();
    for (const layer of Object.values(this.layers)) {
      this.addChild(layer);
    }

    this.interactive = true;
    this.addListeners();
  }

  public tick() {
    this.animationController.tick();
    this.forEachInCamera((tile, loc) => {
      const { item, floor } = this.map.getTile(loc);
      tile.setFloor(floor);
      tile.setItem(item);
    });
    this.computeLight();
    this.drawGrid(); // ?

    this.x = -this.camera.left * GFX_SIZE;
    this.y = -this.camera.top * GFX_SIZE;

    this.layers.grid.x = -this.x;
    this.layers.grid.y = -this.y;

    this.pruneTiles();
  }

  public forEachInCamera(cb: (tile: Tile, loc: Point4, screenX: number, screenY: number) => void) {
    for (let x = 0; x < this.camera.width; x++) {
      for (let y = 0; y < this.camera.height; y++) {
        const mapX = this.camera.left + x;
        const mapY = this.camera.top + y;

        const loc = { ...this.camera.focus, x: mapX, y: mapY };
        cb(this.getTile(loc), loc, x, y);
      }
    }
  }

  public computeLight() {
    const lights = realLighting(this.camera.focus, this, game.client.settings.lightMode);

    for (const animation of this.animationController.animations) {
      const x = animation.location.x - this.camera.left;
      const y = animation.location.y - this.camera.top;
      if (x < 0 || y < 0 || x >= this.camera.width || y >= this.camera.height) continue;

      lights[x][y].tint = animation.tint;
      lights[x][y].alpha = animation.alpha;
    }

    this.forEachInCamera((tile, loc, screenX, screenY) => {
      const { light, tint, alpha } = lights[screenX][screenY];
      tile.setLight(light);
      tile.setTint(tint !== undefined ? tint : 0xFFFFFF, alpha || 0);
    });
  }

  public getTile(loc: Point4) {
    const key = `${loc.w},${loc.x},${loc.y},${loc.z}`;
    let tile = this.tiles.get(key);
    if (!tile) {
      tile = new Tile({ ...loc }, this);
      this.tiles.set(key, tile);
    }

    return tile;
  }

  private addListeners() {
    document.addEventListener('keyup', (e) => {
      if (e.key === 'l') {
        this.ambientLight = (this.ambientLight + 1) % (MAX_LIGHT_POWER + 1);
        this.computeLight();
        console.log({ ambientLight: this.ambientLight });
        return;
      }
    });
  }

  private drawGrid() {
    Draw.destroyChildren(this.layers.grid);

    const { width, height } = this.camera;

    const gridGfx = new PIXI.Graphics();
    this.layers.grid.addChild(gridGfx);
    gridGfx.lineStyle(2, 0xEEEEEE, 0.1);
    for (let x = 0; x < width; x++) {
      gridGfx.moveTo(x * GFX_SIZE, 0);
      gridGfx.lineTo(x * GFX_SIZE, height * GFX_SIZE);
    }
    for (let y = 0; y < height; y++) {
      gridGfx.moveTo(0, y * GFX_SIZE);
      gridGfx.lineTo(width * GFX_SIZE, y * GFX_SIZE);
    }
  }

  private pruneTiles() {
    for (const [key, tile] of this.tiles.entries()) {
      const { w, x, y, z } = tile.loc;
      if (w === this.camera.focus.w && z === this.camera.focus.z &&
        x >= this.camera.left && x <= this.camera.right && y >= this.camera.top && y <= this.camera.bottom) continue;

      tile.destroy();
      this.tiles.delete(key);
    }
  }
}

class Tile {
  private floor?: PIXI.Sprite;
  private floorValue = 0;

  private item?: PIXI.Sprite;
  private itemValue?: Item;

  private tint: PIXI.Graphics;

  private light: PIXI.Graphics;

  private animationSprites = new WeakMap<Animation, PIXI.Sprite>();

  public constructor(public readonly loc: Point4, private worldContainer: WorldContainer) {
    this.tint = new PIXI.Graphics();
    this.tint.alpha = 0;
    this.tint.beginFill(0xFFFFFF);
    this.tint.drawRect(0, 0, GFX_SIZE, GFX_SIZE);
    this.tint.x = loc.x * GFX_SIZE;
    this.tint.y = loc.y * GFX_SIZE;
    worldContainer.layers.tint.addChild(this.tint);

    this.light = new PIXI.Graphics();
    this.light.alpha = 0;
    this.light.beginFill(0);
    this.light.drawRect(0, 0, GFX_SIZE, GFX_SIZE);
    this.light.x = loc.x * GFX_SIZE;
    this.light.y = loc.y * GFX_SIZE;
    worldContainer.layers.light.addChild(this.light);
  }

  public destroy() {
    if (this.floor) this.floor.destroy();
    this.floor = undefined;

    if (this.item) this.item.destroy();
    this.item = undefined;

    this.tint.destroy();
    this.light.destroy();
    for (const sprite of Object.values(this.animationSprites)) {
      sprite.destroy();
    }
  }

  public setFloor(floor: number) {
    if (floor === this.floorValue) return;

    const shouldRedrawNeighbors = floor === WATER || this.floorValue === WATER;
    this.floorValue = floor;
    this.redrawFloor();

    if (shouldRedrawNeighbors) {
      for (let x1 = -1; x1 <= 1; x1++) {
        for (let y1 = -1; y1 <= 1; y1++) {
          if (x1 === 0 && y1 === 0) continue;

          const tile = this.worldContainer.getTile({ ...this.loc, x: this.loc.x + x1, y: this.loc.y + y1 });
          tile.redrawFloor();
        }
      }
    }
  }

  public redrawFloor() {
    const container = this.worldContainer.layers.floors;
    if (this.floor) {
      this.floor.destroy();
      this.floor = undefined;
    }

    let texture;
    if (this.floorValue === WATER) {
      const partition = this.worldContainer.map.getPartition(this.loc.w);
      const templateIdx = getWaterFloor(partition, this.loc);
      texture = Draw.getTexture.templates(templateIdx);
    } else {
      texture = Draw.getTexture.floors(this.floorValue);
    }

    if (texture === PIXI.Texture.EMPTY) {
      this.floorValue = 0;
      return;
    }

    this.floor = new PIXI.Sprite(texture);
    this.floor.x = this.loc.x * GFX_SIZE;
    this.floor.y = this.loc.y * GFX_SIZE;
    container.addChild(this.floor);
  }

  public setItem(item?: Item) {
    if (item === this.itemValue) return;

    const shouldRedrawNeighbors = item?.type === MINE || this.itemValue?.type === MINE;
    this.itemValue = item;
    this.redrawItem();

    if (shouldRedrawNeighbors) {
      for (let x1 = -1; x1 <= 1; x1++) {
        for (let y1 = -1; y1 <= 1; y1++) {
          if (x1 === 0 && y1 === 0) continue;

          const tile = this.worldContainer.getTile({ ...this.loc, x: this.loc.x + x1, y: this.loc.y + y1 });
          tile.redrawItem();
        }
      }
    }
  }

  public redrawItem() {
    const container = this.worldContainer.layers.items;
    if (this.item) {
      this.item.destroy();
      this.item = undefined;
    }
    if (!this.itemValue) return;

    let sprite;
    if (this.itemValue.type === MINE) {
      const partition = this.worldContainer.map.getPartition(this.loc.w);
      const templateIdx = getMineItem(partition, this.loc);
      const texture = Draw.getTexture.templates(templateIdx);
      sprite = new PIXI.Sprite(texture);
    } else {
      sprite = Draw.makeItemSprite2(this.itemValue);
    }

    if (!sprite || sprite.texture === PIXI.Texture.EMPTY) {
      this.itemValue = undefined;
      return;
    }

    this.item = sprite;
    this.item.x = this.loc.x * GFX_SIZE;
    this.item.y = this.loc.y * GFX_SIZE;
    this.item.zIndex = this.loc.y;
    container.addChild(this.item);
  }

  public setTint(tint: number, alpha: number) {
    if (tint === 0xFFFFFF) this.tint.alpha = 0;
    else this.tint.alpha = alpha;

    this.tint.tint = tint;
  }

  public setLight(alpha: number) {
    this.light.alpha = alpha;
  }
}

// ...

// TODO: color blending.
function realLighting(focusLoc: Point3, worldContainer: WorldContainer, lightMode: number): LightResult {
  const cameraWidth = worldContainer.camera.width;
  const cameraHeight = worldContainer.camera.height;

  const visible: boolean[][] = [];
  for (let x = 0; x < cameraWidth; x++) {
    visible[x] = [];
    for (let y = 0; y < cameraHeight; y++) {
      visible[x][y] = false;
    }
  }

  const lights: LightResult = [];
  for (let x = 0; x < cameraWidth; x++) {
    lights[x] = [];
    for (let y = 0; y < cameraHeight; y++) {
      lights[x][y] = { light: focusLoc.z === 0 ? worldContainer.ambientLight : 0 };
    }
  }

  function blocksLight(x: number, y: number) {
    const camerax = x - worldContainer.camera.left;
    const cameray = y - worldContainer.camera.top;
    if (camerax < 0 || cameray < 0 || camerax >= cameraWidth || cameray >= cameraHeight) return true;

    const item = worldContainer.map.getItem({ ...worldContainer.camera.focus, x, y });
    const meta = item && Content.getMetaItem(item.type);
    return Boolean(meta?.blocksLight);
  }

  function setVisible_LOS(x: number, y: number) {
    const camerax = x - worldContainer.camera.left;
    const cameray = y - worldContainer.camera.top;
    if (camerax < 0 || cameray < 0 || camerax >= cameraWidth || cameray >= cameraHeight) return;

    visible[camerax][cameray] = true;
  }

  function getDistance(x: number, y: number) {
    return Math.sqrt(x * x + y * y);
  }

  new Visibility(blocksLight, setVisible_LOS, getDistance).Compute(focusLoc, 100);

  const lightSources: Array<{ x: number; y: number; power: number; tint?: number; alpha?: number }> = [];
  worldContainer.forEachInCamera((tile, loc) => {
    const {item, creature} = worldContainer.map.getTile(loc);

    const meta = item && Content.getMetaItem(item.type);
    if (meta && meta.light) {
      lightSources.push({
        x: loc.x,
        y: loc.y,
        tint: 0x550000,
        // TODO: makes torches look odd in full daylight. Maybe will be ok after color blending.
        // power: 6 + Math.sin(performance.now() / 500) * 0.5,
        power: meta.light + Math.sin(performance.now() / 500) * 0.5,
        alpha: 0.3 + Math.sin(performance.now() / 500) * 0.05,
      });
    }

    if (creature && creature.light) {
      lightSources.push({
        x: loc.x,
        y: loc.y,
        // tint: 0x000000,
        // TODO: makes torches look odd in full daylight. Maybe will be ok after color blending.
        // power: 6 + Math.sin(performance.now() / 500) * 0.5,
        power: creature.light + Math.sin(performance.now() / 500) * 0.5,
        alpha: 0.3 + Math.sin(performance.now() / 500) * 0.05,
      });
    }
  });

  for (const animation of worldContainer.animationController.animations) {
    if (animation.light > 0) {
      lightSources.push({
        x: animation.location.x,
        y: animation.location.y,
        power: animation.light,
        tint: animation.tint,
        alpha: animation.alpha,
      });
    }
  }

  lightSources.push({ x: focusLoc.x, y: focusLoc.y, power: 2 });

  for (const { x, y, power, tint, alpha } of lightSources) {
    function setVisible_Light(x1: number, y1: number) {
      const camerax = x1 - worldContainer.camera.left;
      const cameray = y1 - worldContainer.camera.top;
      if (camerax < 0 || cameray < 0 || camerax >= cameraWidth || cameray >= cameraHeight) return;
      if (!visible[camerax][cameray]) return;

      const dist = Math.sqrt(Math.pow(x1 - x, 2) + Math.pow(y1 - y, 2));
      const lightPower = power - dist;
      if (lightPower <= 0) return;

      if (lightPower > lights[camerax][cameray].light) {
        lights[camerax][cameray].light = lightPower;
        if (tint) {
          lights[camerax][cameray].tint = tint;
          lights[camerax][cameray].alpha = alpha ?? 0.3;
        }
      }
    }

    new Visibility(blocksLight, setVisible_Light, getDistance).Compute({ x, y }, power * 5);
  }

  // TODO
  let MAX_LIGHT_ALPHA = 0;
  let HIDE_NOT_VISIBLE = false;
  switch (lightMode) {
  case 1:
    MAX_LIGHT_ALPHA = 0.7;
    HIDE_NOT_VISIBLE = true;
    break;
  case 2:
    MAX_LIGHT_ALPHA = 0.95;
    HIDE_NOT_VISIBLE = true;
    break;
  case 3:
    MAX_LIGHT_ALPHA = 1;
    HIDE_NOT_VISIBLE = true;
    break;
  }

  for (let x = 0; x < cameraWidth; x++) {
    for (let y = 0; y < cameraHeight; y++) {
      let { light } = lights[x][y];
      light = Utils.clamp(light, 0, MAX_LIGHT_POWER);
      if (HIDE_NOT_VISIBLE && !visible[x][y]) light = 0;

      // Convert from light number to alpha value ... for some reason ...
      light = 1 - light / MAX_LIGHT_POWER;
      light = Utils.clamp(light, 0, MAX_LIGHT_ALPHA);

      lights[x][y].light = light;
    }
  }

  return lights;
}
