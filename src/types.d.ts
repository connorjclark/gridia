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
  item: Item;
  creature?: Creature;
}

type Sector = Tile[][];

interface Item {
  type: number;
  quantity: number;
  growth?: number;
}

interface Creature {
  id: number;
  image: number;
  pos: TilePoint;
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
  burden: number;
  growthItem: number;
  growthDelta: number;
  name: string;
  imageHeight: number;
  animations: number[];
  walkable: boolean;
  moveable: boolean;
  stackable: boolean;
  class: 'Normal' | 'Ore' | 'Cave_down' | 'Cave_up';
  rarity: number;
}

interface ItemUse {
  animation?: string;
  successMessage: string;
  tool: number;
  focus: number;
  toolQuantityConsumed: number;
  focusQuantityConsumed: number;
  successTool?: number;
  products: number[];
  quantities: number[];
}

interface Animation {
  name: string;
  frames: Array<{
    sound: string;
  }>;
}
