import { ProtocolContext, ServerProtocolContext } from "./context";

interface ProtocolDef<T, P extends ProtocolContext = ProtocolContext> {
  check?(context: P, args: T): boolean
  apply(context: P, args: T): void
}

export const setItem: ProtocolDef<Point & {item: Item}> = {
  apply(context, { x, y, item }) {
    context.assertClient()
    context.world.getTile({x, y}).item = item
  }
}

export const moveItem: ProtocolDef<{ from: Point, to: Point }> = {
  check(context, { from, to }) {
    if (!context.world.inBounds(from) || !context.world.inBounds(to)) {
      return false
    }

    if (!context.inView(from) || !context.inView(to)) {
      return false
    }

    const fromTile = context.getTile(from)
    const toTile = context.getTile(to)

    if (fromTile === toTile) {
      return false
    }

    if (!fromTile.item) return false;
    if (toTile.item && fromTile.item.type !== toTile.item.type) return false;

    return true;
  },
  apply(context, { from, to }) {
    const fromTile = context.getTile(from)
    const toTile = context.getTile(to)
    if (toTile.item && toTile.item.type === fromTile.item.type) {
      fromTile.item.quantity += 1
    }
    toTile.item = fromTile.item
    fromTile.item = null

    // context.queueTileChange(from)
    // context.queueTileChange(to)
  }
}

const requested = new Map<string, boolean>()
export const requestSector: ProtocolDef<Point, ServerProtocolContext> = {
  check(context, { x, y }) {
    if (requested.get(x + ',' + y)) {
      return false
    }
    requested.set(x + ',' + y, true)

    const isClose = true // TODO
    return x >= 0 && y >= 0 && isClose
  },
  apply(context, { x, y }) {
    context.assertServer()
    context.reply('sector', {
      x,
      y,
      tiles: context.world.getSector({x, y}),
    })
  }
}

export const sector: ProtocolDef<Point & { tiles: Sector }> = {
  apply(context, { x, y, tiles }) {
    context.world.sectors[x][y] = tiles
  }
}
