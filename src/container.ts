export default class Container {
  constructor(public id: number, public items: Array<Item | null>) {
  }

  public hasItem(itemType: number) {
    for (const item of this.items) {
      if (item && item.type === itemType) return true;
    }
    return false;
  }

  public forEach(fn: (value: Item, index: number, array: Array<Item | null>) => void) {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item) continue;
      fn(item, i, this.items);
    }
  }
}
