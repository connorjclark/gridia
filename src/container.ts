import {MAX_STACK} from './constants.js';
import * as Content from './content.js';
import * as Utils from './utils.js';

export const EQUIP_SLOTS = {
  Head: 0,
  Weapon: 1,
  Chest: 2,
  Shield: 3,
  Legs: 4,
  Ammo: 5,
  Neck: 6,
  Finger: 7,
  Wrist: 8,
};

export function hasItem(container: Container, itemType: number) {
  for (const item of container.items) {
    if (item && item.type === itemType) return true;
  }

  return false;
}

export function isValidLocationToAddItemInContainer(container: Container, index: number, item: Item): boolean {
  const meta = Content.getMetaItem(item.type);

  if (container.type === 'normal') {
    const itemAtIndex = container.items[index];
    if (!itemAtIndex) return true;
    if (!meta.stackable) return false;
    if (itemAtIndex.type !== item.type) return false;
    if (itemAtIndex.quantity + item.quantity > MAX_STACK) return false;
    return true;
  } else if (container.type === 'equipment') {
    return meta.equipSlot !== undefined && EQUIP_SLOTS[meta.equipSlot] === index;
  }

  return false;
}

export function findValidLocationToAddItemToContainer(
  container: Container, item: Item, opts: { allowStacking: boolean }): ContainerLocation | undefined {
  const meta = Content.getMetaItem(item.type);

  if (container.type === 'equipment') {
    if (!meta.equipSlot) return;
    const equipIndex = EQUIP_SLOTS[meta.equipSlot];
    if (container.items[equipIndex]) return;
    return Utils.ItemLocation.Container(container.id, equipIndex);
  }

  const isStackable = opts.allowStacking && meta.stackable;

  // Pick the first slot of the same item type, if stackable.
  // Else, pick the first open slot.
  let firstOpenSlot = null;
  let firstStackableSlot = null;
  for (let i = 0; i < container.items.length; i++) {
    if (firstOpenSlot === null && !container.items[i]) {
      firstOpenSlot = i;
    }
    const containerItem = container.items[i];
    if (isStackable && containerItem && containerItem.type === item.type
      && containerItem.quantity + item.quantity <= MAX_STACK) {
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
    return Utils.ItemLocation.Container(container.id, index);
  }
}

export function forEach(container: Container, fn: (value: Item, index: number, array: Array<Item | null>) => void) {
  for (let i = 0; i < container.items.length; i++) {
    const item = container.items[i];
    if (!item) continue;
    fn(item, i, container.items);
  }
}
