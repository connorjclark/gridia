interface Point {
  x: number;
  y: number;
  z?: number;
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
}

interface Container {
  id: number;
  items: Item[];
}

interface Creature {
  id: number;
  containerId: number;
  image: number;
  pos: Point;
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

interface ClientConnection {
  creature: Creature;
  send: WireMethod<typeof import('./protocol')['ServerToClientProtocol']>;
  getMessage(): any;
  hasMessage(): boolean;
}

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
  class: 'Normal';
}

interface ItemUse {
  successMessage: string;
  tool: number;
  focus: number;
  toolQuantityConsumed: number;
  focusQuantityConsumed: number;
  products: number[];
  quantities: number[];
}
