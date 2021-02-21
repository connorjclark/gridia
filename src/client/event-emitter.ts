import { EventEmitter } from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';

export interface GameActionEvent {
  action: GameAction;
  loc: TilePoint;
  creature: Creature;
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
  message: import('../protocol/server-to-client-protocol-builder').Message;
  mouseMovedOverTile: TilePoint;
  panelFocusChanged: {panelName: string};
  playerMove: {from: TilePoint; to: TilePoint};
  tileClicked: TilePoint;
  pointerDown: TilePoint;
  pointerMove: TilePoint;
  pointerUp: TilePoint;
}

const TypedEventEmitter: new() => StrictEventEmitter<EventEmitter, Events> = EventEmitter;

export default TypedEventEmitter;
