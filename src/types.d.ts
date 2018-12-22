interface Point {
  x: number
  y: number
}

interface Tile {
  floor: number
  item: Item
}

type Sector = Tile[][]

interface Item {
  type: number
  quantity: number
}

interface Wire {
  send<T extends keyof typeof import("./protocol")>(type: T, args: Parameters<(typeof import("./protocol"))[T]['check']>[1]): void
  receive<T>(...args: Parameters<Wire['send']>): void
}
