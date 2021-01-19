declare namespace NodeJS {
  interface Global {
    node: boolean;
  }
}

type Array2D<T> = T[][];
type Array3D<T> = T[][][];

interface Point2 {
  x: number;
  y: number;
}

interface Point3 {
  x: number;
  y: number;
  z: number;
}

interface Point4 {
  w: number;
  x: number;
  y: number;
  z: number;
}

type ScreenPoint = Point2;
type PartitionPoint = Point3;
type TilePoint = Point4; // `w` is world index

interface Tile {
  floor: number;
  item?: Item; // Prefer undefined over null.
  creature?: Creature;
}

/** Either a world location or from a container. */
type ItemLocation = {
  source: 'world';
  loc: TilePoint;
} | {
  source: 'container';
  id: number;
  index?: number;
};

interface PossibleUsage {
  toolIndex: number;
  use: ItemUse;
  focusLocation: ItemLocation;
}

type Sector = Tile[][];

interface Item {
  type: number;
  quantity: number;
  growth?: number;
  containerId?: number;
  warpTo?: TilePoint;
}

interface Creature {
  id: number;
  image: number;
  image_type?: number;
  name: string;
  pos: TilePoint;
  isPlayer: boolean;
  tamedBy?: number; // player id
  roam?: number;
  speed: number;
  life: number;
  food: number;
  eat_grass: boolean;
  light: number;
}

type ServerToClientMessage = import('./protocol/gen/server-to-client-protocol-builder').Message;
type ClientToServerMessage = import('./protocol/gen/client-to-server-protocol-builder').Message;

interface MetaFloor {
  id: number;
  color: string;
}

interface MetaItem {
  id: number;
  name: string;
  class: 'Normal' | 'Ore' | 'CaveDown' | 'CaveUp' | 'Container' | 'Ball';
  animations: number[];
  burden: number;
  growthDelta: number;
  growthItem: number;
  imageHeight: number;
  moveable: boolean;
  light: number;
  blocksLight: boolean;
  rarity: number;
  stackable: boolean;
  walkable: boolean;
  trapEffect: 'Warp';
}

interface ItemUse {
  animation?: string;
  successMessage: string;
  tool: number;
  focus: number;
  toolQuantityConsumed: number;
  focusQuantityConsumed: number;
  successTool?: number;
  products: Array<{ type: number; quantity: number }>;
  skill?: string;
  skillSuccessXp?: number;
}

interface Skill {
  id: number;
  name: string;
}

interface GridiaAnimation {
  name: string;
  frames: Array<{
    sprite: number;
    sound?: string;
  }>;
}

interface Monster {
  id: number;
  name: string;
  image: number;
  image_type?: number;
  speed: number;
  life: number;
  roam?: number;
  eat_grass: boolean;
}

interface UIState {
  mouse: {
    x: number;
    y: number;
    tile?: TilePoint;
    downTile?: TilePoint;
    state: string;
  };
  selectedView: {
    tile?: TilePoint;
    creatureId?: number;
    actions: GameAction[];
  };
  elapsedFrames: number;
}

interface GameAction {
  type: string;
  innerText: string;
  title: string;
}

type GameActionCreator = (tile: Tile, loc: TilePoint) => GameAction[] | GameAction | undefined;

// https://stackoverflow.com/a/49397693
type NoMethodKeys<T> = ({ [P in keyof T]: T[P] extends Function ? never : P })[keyof T];
type NoMethods<T> = Pick<T, NoMethodKeys<T>>;

interface ServerOptions {
  serverData: string;
  verbose: boolean;
}

interface CLIOptions extends ServerOptions {
  port: number;
  ssl?: {
    cert: string;
    key: string;
  };
}

interface ServerWorkerOpts extends ServerOptions {
  dummyDelay: number;
  useMapPreview?: boolean;
}

declare module 'pixi-scrollbox' {
  class Scrollbox {
    public content: PIXI.Container;
    public constructor(...args: any[]);
    public update(): void;
  }
}

declare module 'pixi-text-input' {
  class TextInput {
    public placeholder: string;
    public height: number;
    public constructor(styles: any);
    public on(event: string, cb: (text: string) => void): any;
  }

  export default TextInput;
}

declare namespace PIXI {
  // const PIXISound: any;
  let Scrollbox: typeof import('pixi-scrollbox').Scrollbox;
  let OutlineFilter: typeof import('@pixi/filter-outline').OutlineFilter;
  let TextInput: typeof import('pixi-text-input').default;
}
