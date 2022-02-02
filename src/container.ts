import {MAX_STACK} from './constants.js';
import * as Content from './content.js';
import * as Player from './player.js';
import * as EventBuilder from './protocol/event-builder.js';
import {ClientConnection} from './server/client-connection.js';
import {Server} from './server/server.js';
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

  if (container.type === 'equipment') {
    if (!meta.equipSlot) return false;
    if (EQUIP_SLOTS[meta.equipSlot] !== index) return false;
  }

  const itemAtIndex = container.items[index];
  if (!itemAtIndex) return true;
  if (!meta.stackable) return false;
  if (itemAtIndex.type !== item.type) return false;
  if (itemAtIndex.quantity + item.quantity > MAX_STACK) return false;

  return true;
}

interface FindLocationOptions {
  allowStacking: boolean;
  excludeIndices?: number[];
}

export function findValidLocationToAddItemToContainer(container: Container, item: Item,
                                                      opts: FindLocationOptions): ContainerLocation | undefined {
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
    if (opts.excludeIndices?.includes(i)) continue;

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

export function countItem(container: Container, type: number): number {
  let value = 0;
  forEach(container, (item) => {
    if (item.type === type) value += item.quantity;
  });
  return value;
}

export function countBurden(container: Container): number {
  let value = 0;
  forEach(container, (item) => {
    const meta = Content.getMetaItem(item.type);
    value += item.quantity * meta.burden;
  });
  return value;
}

export function forEach(container: Container, fn: (value: Item, index: number, array: Array<Item | null>) => void) {
  for (let i = 0; i < container.items.length; i++) {
    const item = container.items[i];
    if (!item) continue;
    fn(item, i, container.items);
  }
}

export function setItemInContainer(server: Server, container: Container, index: number, item?: Item) {
  if (item?.quantity === 0) item = undefined;

  const prevItem = container.items[index];
  container.items[index] = item || null;

  server.conditionalBroadcast(EventBuilder.setItem({
    location: Utils.ItemLocation.Container(container.id, index),
    item,
  }), (clientConnection) => {
    if (clientConnection.container.id === container.id) return true;
    if (clientConnection.equipment.id === container.id) return true;
    return clientConnection.registeredContainers.includes(container.id);
  });

  const client = server.context.clientConnections
    .find((c) => c.container?.id === container.id || c.equipment?.id === container.id);
  if (!client?.isPlayerConnection()) return;

  if (container.type === 'normal') {
    server.updateCreatureDataBasedOnInventory(client);
  } else if (container.type === 'equipment') {
    server.updateCreatureDataBasedOnEquipment(client.creature, container, {broadcast: true});
  }
}

export function addItemToContainer(server: Server, container: Container, item: Item): boolean {
  const location = findValidLocationToAddItemToContainer(container, item, {allowStacking: true});
  if (location?.index === undefined) return false;

  const curItemQuantity = container.items[location.index]?.quantity || 0;
  setItemInContainer(server, container, location.index, {...item, quantity: curItemQuantity + item.quantity});
  return true;
}

export function removeItemAmount(server: Server, container: Container, type: number, quantity: number): boolean {
  const indicesToQuantityToRemove = new Map<number, number>();

  let countLeft = quantity;
  for (let i = 0; i < container.items.length; i++) {
    const item = container.items[i];
    if (!item) continue;
    if (item.type !== type) continue;

    const amountToTake = Math.min(item.quantity, countLeft);
    countLeft -= amountToTake;
    indicesToQuantityToRemove.set(i, amountToTake);

    if (countLeft === 0) break;
  }

  if (countLeft > 0) return false;

  for (const [index, amountToTake] of indicesToQuantityToRemove) {
    const item = container.items[index];
    if (!item) throw new Error();

    item.quantity -= amountToTake;
    setItemInContainer(server, container, index, item);
  }

  return true;
}
