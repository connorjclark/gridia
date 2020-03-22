import { EventEmitter } from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';

export interface GameActionEvent {
  action: GameAction;
  loc: TilePoint;
  creature: Creature;
}

export interface ItemMoveBeginEvent {
  /** 0 represents the world. Positive integers represent a container id. */
  source: number;
  /** Either a world location (source = 0) or loc.x is equal to index in container. */
  loc: TilePoint;
  item?: Item;
}

export interface ItemMoveEndEvent {
  source: number;
  loc?: TilePoint;
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
  playerMove: void;
  tileClicked: TilePoint;
}

const TypedEventEmitter: new() => StrictEventEmitter<EventEmitter, Events> = EventEmitter;

export default TypedEventEmitter;
