const items: MetaItem[] = require('../world/content/items.json')

interface MetaItem {
  id: number
  burden: number
  growthItem: number
  growthDelta: number
  name: string
  animations: number[]
  walkable: boolean
  moveable: boolean
  stackable: boolean
  class: 'Normal'
}

export function getMetaItem(id: number): MetaItem {
  return items[id]
}
