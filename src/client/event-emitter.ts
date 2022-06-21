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

export interface ClientEvents {
  action: GameActionEvent;
  containerWindowSelectedIndexChanged: void;
  editingMode: {enabled: boolean};
  event: ProtocolEvent;
  floorUpdate: {pos: TilePoint; floor: number};
  itemMoveBegin: ItemMoveBeginEvent;
  itemMoveEnd: ItemMoveEndEvent;
  itemUpdate: {location: ItemLocation; item: Item | undefined};
  playerMove: {from: TilePoint; to: TilePoint};
  pointerDown: TilePoint;
  pointerMove: TilePoint;
  pointerUp: TilePoint;
  tileClicked: TilePoint;
}

export const TypedEventEmitter: new() => StrictEventEmitter<EventEmitter, ClientEvents> = EventEmitter;
