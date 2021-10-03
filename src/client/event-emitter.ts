import {EventEmitter} from 'events';

import {StrictEventEmitter} from 'strict-event-emitter-types';

import {ProtocolEvent} from '../protocol/event-builder.js';

export interface GameActionEvent {
  action: GameAction;
  location: ItemLocation;
  creature: Creature;
  quantity?: number;
}

export interface ItemMoveBeginEvent {
  location: ItemLocation;
  item?: Item;
}

export interface ItemMoveEndEvent {
  location: ItemLocation;
}

interface Events {
  action: GameActionEvent;
  containerWindowSelectedIndexChanged: void;
  editingMode: {enabled: boolean};
  itemMoveBegin: ItemMoveBeginEvent;
  itemMoveEnd: ItemMoveEndEvent;
  event: ProtocolEvent;
  mouseMovedOverTile: TilePoint;
  panelFocusChanged: {panelName: string};
  playerMove: {from: TilePoint; to: TilePoint};
  tileClicked: TilePoint;
  pointerDown: TilePoint;
  pointerMove: TilePoint;
  pointerUp: TilePoint;
}

export const TypedEventEmitter: new() => StrictEventEmitter<EventEmitter, Events> = EventEmitter;
