import * as Content from '../content';
import { game } from '../game-singleton';
import * as ProtocolBuilder from '../protocol/client-to-server-protocol-builder';
import * as Utils from '../utils';

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
export function useTool(loc: TilePoint, toolIndex: number, usageIndex?: number) {
  const tool = getInventory().items[toolIndex];
  if (!tool || toolIndex === -1) {
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
    game.modules.usage.openUsages(usages, loc);
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

export function getInventory() {
  const container = game.client.context.containers.get(game.client.player.containerId);
  if (!container) throw new Error();
  return container;
}

export function getSelectedTool() {
  const selectedIndex = game.state.containers[game.client.player.containerId]?.selectedIndex;
  if (selectedIndex === null) return;

  const container = game.client.context.containers.get(game.client.player.containerId);
  return container?.items[selectedIndex] ?? undefined;
}

export function getSelectedToolIndex() {
  const selectedIndex = game.state.containers[game.client.player.containerId]?.selectedIndex;
  return selectedIndex ?? -1;
}

export function find(query: string, node?: Element): HTMLElement {
  if (!node) node = document.body;
  const result = node.querySelector(query);
  if (!result) throw new Error(`no elements matching ${query}`);
  // ?
  if (!(result instanceof HTMLElement)) throw new Error('expected HTMLElement');
  return result;
}

export function maybeFind(query: string, node?: Element): HTMLElement | undefined {
  if (!node) node = document.body;
  const result = node.querySelector(query);
  if (!result) return;
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

type PrecedenceMatcher =
  | { type: 'equal'; value: string };
function matches(item: string, matcher: PrecedenceMatcher) {
  if (matcher.type === 'equal') {
    return item === matcher.value;
  } else {
    return false;
  }
}

export function sortByPrecedence(items: string[], matchers: PrecedenceMatcher[]) {
  items.sort((a, b) => {
    const aMatcherIndex = matchers.findIndex((m) => matches(a, m));
    const bMatcherIndex = matchers.findIndex((m) => matches(b, m));

    // If neither value has a match, or they are equal, use an alphabetical comparison.
    if (aMatcherIndex === -1 && bMatcherIndex === -1) {
      return a.localeCompare(b);
    }

    // If just one value has a match, it is greater.
    if (aMatcherIndex === -1 && bMatcherIndex >= 0) {
      return 1;
    }
    if (bMatcherIndex === -1 && aMatcherIndex >= 0) {
      return -1;
    }

    // Both values have a match, so do a simple comparison.
    return aMatcherIndex - bMatcherIndex;
  });

  return items;
}
