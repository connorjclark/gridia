import { worldToSector } from "./utils";
import {ClientToServerProtocol} from './protocol'

const WORLD_SIZE = 100
const SECTOR_SIZE = 20
const SECTORS_SIDE = WORLD_SIZE / SECTOR_SIZE

function createSector(bare: boolean) {
  /** @type {Tile[][]} */
  const tiles = []

  for (let x = 0; x < SECTOR_SIZE; x++) {
    tiles[x] = []
    for (let y = 0; y < SECTOR_SIZE; y++) {
      if (bare) {
        tiles[x][y] = {
          floor: 5,
          item: null,
        }
      } else {
        tiles[x][y] = {
          floor: 100 + ((x + y) % 10) * 20,
          item: x === y ? {
            type: 7,
            quantity: 1,
          } : null,
        }
      }
    }
  }

  return tiles
}

function matrix<T>(w: number, h: number, val: T = null): T[][] {
  const m = Array(w)

  for (let i = 0; i < w; i++) {
    m[i] = Array(h)
    for (let j = 0; j < h; j++) {
      m[i][j] = val
    }
  }

  return m
}

export abstract class WorldContext {
  size: number = WORLD_SIZE
  sectors: Sector[][] = matrix(WORLD_SIZE, WORLD_SIZE)
  creatures: Record<number, Creature> = {}

  abstract load(point: Point): Sector

  inBounds(point: Point): boolean {
    return point.x >= 0 && point.y >= 0 && point.x < this.size && point.y < this.size
  }

  getSector(sectorPoint: Point): Sector {
    let sector = this.sectors[sectorPoint.x][sectorPoint.y]
    if (!sector) {
      sector = this.sectors[sectorPoint.x][sectorPoint.y] = this.load(sectorPoint)
    }
    return sector
  }

  getTile(point: Point): Tile | null {
    if (point.x < 0 || point.y < 0) return {floor: 0, item: null};

    const sector = this.getSector(worldToSector(point, SECTOR_SIZE))
    return sector[point.x % SECTOR_SIZE][point.y % SECTOR_SIZE]
  }

  getItem(point: Point) {
    return this.getTile(point).item
  }

  getCreature(id: number): Creature | void {
    return this.creatures[id];
  }

  setCreature(creature: Creature) {
    this.creatures[creature.id] = creature
    this.getTile(creature.pos).creature = creature
  }
}

export class ClientWorldContext extends WorldContext {
  constructor(private wire: ClientToServerWire) {
    super()
  }

  load(point: Point): Sector {
    this.wire.send('requestSector', point)
    return createSector(true) // temporary until server sends something
  }
}

export class ServerWorldContext extends WorldContext {
  load(point: Point): Sector {
    // TODO load from disk
    return createSector(false)
  }
}
