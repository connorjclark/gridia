import * as Content from '../content';
import { game } from '../game-singleton';
import * as ProtocolBuilder from '../protocol/client-to-server-protocol-builder';
import * as Utils from '../utils';
import * as Draw from './draw';

export function canUseHand(itemType: number) {
  return usageExists(0, itemType);
}

export function usageExists(tool: number, focus: number) {
  return Content.getItemUses(tool, focus).length !== 0;
}

export function useHand(loc: TilePoint) {
  game.client.connection.send(ProtocolBuilder.use({
    toolIndex: -1,
    location: Utils.ItemLocation.World(loc),
  }));
}

/**
 * Uses selected tool on item at `loc`.
 * If there are multiple options for the usage, and `usageIndex` is not provided,
 * a dialog box is shown to choose.
 */
export function useTool(loc: TilePoint, usageIndex?: number) {
  const toolIndex = getSelectedToolIndex();
  const tool = getSelectedTool();
  if (!tool || toolIndex < 0) {
    // TODO: Remove this special case.
    useHand(loc);
    return;
  }

  const focus = game.client.context.map.getItem(loc) || { type: 0, quantity: 0 };
  const usages = Content.getItemUses(tool.type, focus.type);

  if (usages.length === 0) {
    return;
  }

  if (usages.length === 1 || usageIndex !== undefined) {
    game.client.connection.send(ProtocolBuilder.use({
      toolIndex,
      location: Utils.ItemLocation.World(loc),
      usageIndex,
    }));
  } else {
    Draw.makeUsageWindow(tool, focus, usages, loc);
  }
}

// TODO: add tests checking that subscribed containers are updated in all clients.
// TODO: don't keep requesting container if already open.
export function openContainer(loc: TilePoint) {
  game.client.connection.send(ProtocolBuilder.requestContainer({
    loc,
  }));
}

export function closeContainer(containerId: number) {
  game.client.connection.send(ProtocolBuilder.closeContainer({
    containerId,
  }));
}

export function getW() {
  const focusCreature = game.client.creature;
  return focusCreature ? focusCreature.pos.w : 0;
}

export function getZ() {
  const focusCreature = game.client.creature;
  return focusCreature ? focusCreature.pos.z : 0;
}

export function getSelectedTool() {
  const inventoryWindow = Draw.getContainerWindow(game.client.player.containerId);
  if (!inventoryWindow) return;

  const selectedIndex = inventoryWindow.selectedIndex;
  if (selectedIndex === null) return;

  return inventoryWindow.itemsContainer.items[selectedIndex] ?? undefined;
}

export function getSelectedToolIndex() {
  const inventoryWindow = Draw.getContainerWindow(game.client.player.containerId);
  return inventoryWindow?.selectedIndex ?? -1;
}

export function find(query: string, node?: Element): HTMLElement {
  if (!node) node = document.body;
  const result = node.querySelector(query);
  if (!result) throw new Error(`no elements matching ${query}`);
  // ?
  if (!(result instanceof HTMLElement)) throw new Error('expected HTMLElement');
  return result;
}

export function findAll(query: string, node?: Element): Element[] {
  if (!node) node = document.body;
  const result = [...node.querySelectorAll(query)];
  if (!result.length) throw new Error(`no elements matching ${query}`);
  return result;
}

type HTMLElementByTagName = HTMLElementTagNameMap & { [id: string]: HTMLElement };

export function createElement<T extends string>(name: T, className?: string, attrs: Record<string, string> = {}) {
  const element = document.createElement(name);
  if (className) {
    element.className = className;
  }
  Object.keys(attrs).forEach((key) => {
    const value = attrs[key];
    if (typeof value !== 'undefined') {
      element.setAttribute(key, value);
    }
  });
  return element as HTMLElementByTagName[T];
}

export function createChildOf<T extends string>(
  parentElem: Element, elementName: T, className?: string, attrs?: Record<string, string>) {
  const element = createElement(elementName, className, attrs);
  parentElem.appendChild(element);
  return element;
}
