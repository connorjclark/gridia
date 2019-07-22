/* tslint:disable */
import Server from '../../server/server';
import Container from '../../container';

export interface AdminSetFloorParams extends TilePoint {
  floor: number;
}

export interface AdminSetItemParams extends TilePoint {
  item?: Item;
}

export interface CloseContainerParams {
  containerId: number;
}

export interface MoveParams extends TilePoint {
}

export interface MoveItemParams {
  from: TilePoint;
  fromSource: number;
  to?: TilePoint;
  toSource: number;
}

export interface RegisterParams {
  name: string;
}

export interface RequestContainerParams {
  containerId?: number;
  loc: TilePoint;
}

export interface RequestCreatureParams {
  id: number;
}

export interface RequestPartitionParams {
  w: number;
}

export interface RequestSectorParams extends TilePoint {
}

export interface TameParams {
  creatureId: number;
}

export interface UseParams {
  toolIndex: number;
  loc: TilePoint;
  usageIndex?: number;
}

export interface ClientToServerProtocol {
  onAdminSetFloor(server: Server, {floor, ...loc}: AdminSetFloorParams): void;
  onAdminSetItem(server: Server, {item, ...loc}: AdminSetItemParams): void;
  onCloseContainer(server: Server, {containerId}: CloseContainerParams): void;
  onMove(server: Server, {...loc}: MoveParams): void;
  onMoveItem(server: Server, {from, fromSource, to, toSource}: MoveItemParams): void;
  onRegister(server: Server, {name}: RegisterParams): void;
  onRequestContainer(server: Server, {containerId, loc}: RequestContainerParams): void;
  onRequestCreature(server: Server, {id}: RequestCreatureParams): void;
  onRequestPartition(server: Server, {w}: RequestPartitionParams): void;
  onRequestSector(server: Server, {...loc}: RequestSectorParams): void;
  onTame(server: Server, {creatureId}: TameParams): void;
  onUse(server: Server, {toolIndex, loc, usageIndex}: UseParams): void;
}
