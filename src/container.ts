import * as Content from './content';
import * as Utils from './utils';

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

  isValidLocationToAddItemInContainer(index: number, item: Item): boolean {
    const meta = Content.getMetaItem(item.type);

    if (this.type === ContainerType.Normal) {
      if (!this.items[index]) return true;
      if (!meta.stackable) return false;
      // TODO: check stack limit.
      return this.items[index]?.type === item.type;
    } else if (this.type === ContainerType.Equipment) {
      return meta.equipSlot !== undefined && Container.EQUIP_SLOTS[meta.equipSlot] === index;
    }

    return false;
  }

  findValidLocationToAddItemToContainer(item: Item, opts: { allowStacking: boolean }): ContainerLocation | undefined {
    const meta = Content.getMetaItem(item.type);

    if (this.type === ContainerType.Equipment) {
      if (!meta.equipSlot) return;
      const equipIndex = Container.EQUIP_SLOTS[meta.equipSlot];
      if (this.items[equipIndex]) return;
      return Utils.ItemLocation.Container(this.id, equipIndex);
    }

    const isStackable = opts.allowStacking && meta.stackable;

    // Pick the first slot of the same item type, if stackable.
    // Else, pick the first open slot.
    let firstOpenSlot = null;
    let firstStackableSlot = null;
    for (let i = 0; i < this.items.length; i++) {
      if (firstOpenSlot === null && !this.items[i]) {
        firstOpenSlot = i;
      }
      const containerItem = this.items[i];
      if (isStackable && containerItem && containerItem.type === item.type) {
        firstStackableSlot = i;
        break;
      }
    }

    let index;
    if (firstStackableSlot !== null) {
      index = firstStackableSlot;
    } else if (firstOpenSlot !== null) {
      index = firstOpenSlot;
    }

    if (index !== undefined) {
      return Utils.ItemLocation.Container(this.id, index);
    }
  }

  forEach(fn: (value: Item, index: number, array: Array<Item | null>) => void) {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item) continue;
      fn(item, i, this.items);
    }
  }
}
