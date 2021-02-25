// eslint-disable-next-line no-shadow
export enum ContainerType {
  Normal, Equipment,
}

export default class Container {
  static EQUIP_SLOTS = {
    Head: 0,
    Weapon: 1,
    Chest: 2,
    Shield: 3,
    Legs: 4,
  };

  constructor(readonly type: ContainerType, public id: number, public items: Array<Item | null>) {
  }

  hasItem(itemType: number) {
    for (const item of this.items) {
      if (item && item.type === itemType) return true;
    }
    return false;
  }

  forEach(fn: (value: Item, index: number, array: Array<Item | null>) => void) {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item) continue;
      fn(item, i, this.items);
    }
  }
}
