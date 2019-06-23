import * as Content from '../content';
import * as Draw from './draw';
import god from './god';

export function canUseHand(itemType: number) {
  return usageExists(0, itemType);
}

export function usageExists(tool: number, focus: number) {
  return Content.getItemUses(tool, focus).length !== 0;
}

export function useHand(loc: TilePoint) {
  god.client.wire.send('use', {
    toolIndex: -1,
    loc,
  });
}

export function useTool(loc: TilePoint, usageIndex?: number) {
  const toolIndex = getSelectedToolIndex();
  const tool = getSelectedTool();
  const focus = god.client.context.map.getItem(loc) || {type: 0, quantity: 0};
  const usages = Content.getItemUses(tool.type, focus.type);

  if (usages.length === 0) {
    return;
  }

  if (usages.length === 1 || usageIndex !== undefined) {
    god.client.wire.send('use', {
      toolIndex,
      loc,
      usageIndex,
    });
  } else {
    Draw.makeUsageWindow(tool, focus, usages, loc);
  }
}

// TODO: add tests checking that subscribed containers are updated in all clients.
// TODO: don't keep requesting container if already open.
export function openContainer(loc: TilePoint) {
  god.client.wire.send('requestContainer', {
    loc,
  });
}

export function closeContainer(containerId: number) {
  god.client.wire.send('closeContainer', {
    containerId,
  });
}

export function getZ() {
  const focusCreature = god.client.context.getCreature(god.client.creatureId);
  return focusCreature ? focusCreature.pos.z : 0;
}

export function getSelectedTool() {
  const inventoryWindow = Draw.getContainerWindow(god.client.containerId);
  return inventoryWindow.itemsContainer.items[inventoryWindow.selectedIndex];
}

export function getSelectedToolIndex() {
  const inventoryWindow = Draw.getContainerWindow(god.client.containerId);
  return inventoryWindow.selectedIndex;
}

export function find(query: string, node?: Element): HTMLElement {
  if (!node) node = document.body;
  const result = node.querySelector(query);
  if (!result) throw new Error(`no elements matching ${query}`);
  if (!(result instanceof HTMLElement)) throw new Error('expected HTMLElement');
  return result;
}
