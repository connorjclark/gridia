const items: (MetaItem | null)[] = require('../world/content/items.json')

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

export function getMetaItemByName(name: string): MetaItem {
  return items.find(item => item && item.name === name);
}
