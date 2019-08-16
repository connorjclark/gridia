import * as Content from '../content';
import { game } from '../game-singleton';
import * as ProtocolBuilder from '../protocol/client-to-server-protocol-builder';
import * as Draw from './draw';

export function canUseHand(itemType: number) {
  return usageExists(0, itemType);
}

export function usageExists(tool: number, focus: number) {
  return Content.getItemUses(tool, focus).length !== 0;
}

export function useHand(loc: TilePoint) {
  game.client.wire.send(ProtocolBuilder.use({
    toolIndex: -1,
    loc,
  }));
}

export function useTool(loc: TilePoint, usageIndex?: number) {
  const toolIndex = getSelectedToolIndex();
  const tool = getSelectedTool();
  const focus = game.client.context.map.getItem(loc) || {type: 0, quantity: 0};
  const usages = Content.getItemUses(tool.type, focus.type);

  if (usages.length === 0) {
    return;
  }

  if (usages.length === 1 || usageIndex !== undefined) {
    game.client.wire.send(ProtocolBuilder.use({
      toolIndex,
      loc,
      usageIndex,
    }));
  } else {
    Draw.makeUsageWindow(tool, focus, usages, loc);
  }
}

// TODO: add tests checking that subscribed containers are updated in all clients.
// TODO: don't keep requesting container if already open.
export function openContainer(loc: TilePoint) {
  game.client.wire.send(ProtocolBuilder.requestContainer({
    loc,
  }));
}

export function closeContainer(containerId: number) {
  game.client.wire.send(ProtocolBuilder.closeContainer({
    containerId,
  }));
}

export function getW() {
  const focusCreature = game.client.context.getCreature(game.client.creatureId);
  return focusCreature ? focusCreature.pos.w : 0;
}

export function getZ() {
  const focusCreature = game.client.context.getCreature(game.client.creatureId);
  return focusCreature ? focusCreature.pos.z : 0;
}

export function getSelectedTool() {
  const inventoryWindow = Draw.getContainerWindow(game.client.containerId);
  return inventoryWindow.itemsContainer.items[inventoryWindow.selectedIndex];
}

export function getSelectedToolIndex() {
  const inventoryWindow = Draw.getContainerWindow(game.client.containerId);
  return inventoryWindow.selectedIndex;
}

export function find(query: string, node?: Element): HTMLElement {
  if (!node) node = document.body;
  const result = node.querySelector(query);
  if (!result) throw new Error(`no elements matching ${query}`);
  if (!(result instanceof HTMLElement)) throw new Error('expected HTMLElement');
  return result;
}
