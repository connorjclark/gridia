import { EventEmitter } from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';

export interface GameActionEvent {
  action: GameAction;
  loc: TilePoint;
  creature: Creature;
}

interface Events {
  panelFocusChanged: {panelName: string};
  message: import('../protocol/server-to-client-protocol-builder').Message;
  Action: GameActionEvent;
  MouseMovedOverTile: TilePoint;
  ItemMoveBegin: ItemMoveBeginEvent;
  ItemMoveEnd: ItemMoveEndEvent;
  TileClicked: TilePoint;
  containerWindowSelectedIndexChanged: void;
  PlayerMove: void;
  EditingMode: {enabled: boolean};
}

const TypedEventEmitter: new() => StrictEventEmitter<EventEmitter, Events> = EventEmitter;

export default TypedEventEmitter;
