interface TilePoint {
  w: number; // world index
  x: number;
  y: number;
  z: number;
}

interface PartitionPoint {
  x: number;
  y: number;
  z: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

interface Tile {
  floor: number;
  item?: Item; // Prefer undefined over null.
  creature?: Creature;
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
  name: string;
  pos: TilePoint;
  isPlayer: boolean;
  tamedBy?: number; // player id
}

type ServerToClientMessage = import('./protocol/gen/server-to-client-protocol-builder').Message;
type ClientToServerMessage = import('./protocol/gen/client-to-server-protocol-builder').Message;

interface ServerToClientWire {
  receive(message: ClientToServerMessage): void;
  send(message: ServerToClientMessage): void;
}

interface ClientToServerWire {
  receive(message: ServerToClientMessage): void;
  send(message: ClientToServerMessage): void;
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
  products: Array<{type: number, quantity: number}>;
  skill?: string;
  skillSuccessXp?: number;
}

interface Skill {
  id: number;
  name: string;
}

interface Animation {
  name: string;
  frames: Array<{
    sound: string;
  }>;
}

interface Monster {
  id: number;
  name: string;
  image: number;
}

interface ItemMoveEvent {
  source: number;
  loc?: TilePoint;
  item?: Item;
}

interface UIState {
  viewport: {
    x: number;
    y: number;
  };
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
  };
  elapsedFrames: number;
}

interface GameAction {
  type: string;
  innerText: string;
  title: string;
}

type GameActionCreator = (tile: Tile, loc: TilePoint) => GameAction[] | GameAction | undefined;

interface GameActionEvent {
  action: GameAction;
  loc: TilePoint;
  creature: Creature;
}

// https://stackoverflow.com/a/49397693
type NoMethodKeys<T> = ({[P in keyof T]: T[P] extends Function ? never : P })[keyof T];
type NoMethods<T> = Pick<T, NoMethodKeys<T>>;

interface OpenAndConnectToServerOpts {
  dummyDelay: number;
  verbose: boolean;
  context?: import('./server/server-context').ServerContext;
}
