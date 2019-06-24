interface TilePoint {
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
}

interface Creature {
  id: number;
  image: number;
  name: string;
  pos: TilePoint;
  isPlayer: boolean;
  tamedBy?: number; // player id
}

interface ProtocolDef<T> {
  // check?(context: P, args: T): boolean
  apply(context, args: T): void;
}

type WireMap = Record<string, (...args: any[]) => void>;

type WireMethod<P extends WireMap> =
  <T extends keyof P>(type: T, args: Parameters<P[T]>[1]) => void;

interface Wire<Input extends WireMap, Output extends WireMap> {
  receive: WireMethod<Input>;
  send: WireMethod<Output>;
}

type ServerToClientWire = Wire<
  typeof import('./protocol')['ClientToServerProtocol'],
  typeof import('./protocol')['ServerToClientProtocol']
>;

type ClientToServerWire = Wire<
  typeof import('./protocol')['ServerToClientProtocol'],
  typeof import('./protocol')['ClientToServerProtocol']
>;

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
