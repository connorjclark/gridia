/* tslint:disable */
import * as Protocol from './client-to-server-protocol';

type AdminSetFloorMessage = {type: "adminSetFloor", args: Protocol.AdminSetFloorParams}
type AdminSetItemMessage = {type: "adminSetItem", args: Protocol.AdminSetItemParams}
type CloseContainerMessage = {type: "closeContainer", args: Protocol.CloseContainerParams}
type MoveMessage = {type: "move", args: Protocol.MoveParams}
type MoveItemMessage = {type: "moveItem", args: Protocol.MoveItemParams}
type RegisterMessage = {type: "register", args: Protocol.RegisterParams}
type RequestContainerMessage = {type: "requestContainer", args: Protocol.RequestContainerParams}
type RequestCreatureMessage = {type: "requestCreature", args: Protocol.RequestCreatureParams}
type RequestPartitionMessage = {type: "requestPartition", args: Protocol.RequestPartitionParams}
type RequestSectorMessage = {type: "requestSector", args: Protocol.RequestSectorParams}
type TameMessage = {type: "tame", args: Protocol.TameParams}
type UseMessage = {type: "use", args: Protocol.UseParams}

export type Message = AdminSetFloorMessage
  | AdminSetItemMessage
  | CloseContainerMessage
  | MoveMessage
  | MoveItemMessage
  | RegisterMessage
  | RequestContainerMessage
  | RequestCreatureMessage
  | RequestPartitionMessage
  | RequestSectorMessage
  | TameMessage
  | UseMessage

export function adminSetFloor({floor, ...loc}: Protocol.AdminSetFloorParams): AdminSetFloorMessage {
  return {type: "adminSetFloor", args: {floor, ...loc}};
}

export function adminSetItem({item, ...loc}: Protocol.AdminSetItemParams): AdminSetItemMessage {
  return {type: "adminSetItem", args: {item, ...loc}};
}

export function closeContainer({containerId}: Protocol.CloseContainerParams): CloseContainerMessage {
  return {type: "closeContainer", args: {containerId}};
}

export function move({...loc}: Protocol.MoveParams): MoveMessage {
  return {type: "move", args: {...loc}};
}

export function moveItem({from, fromSource, to, toSource}: Protocol.MoveItemParams): MoveItemMessage {
  return {type: "moveItem", args: {from, fromSource, to, toSource}};
}

export function register({name}: Protocol.RegisterParams): RegisterMessage {
  return {type: "register", args: {name}};
}

export function requestContainer({containerId, loc}: Protocol.RequestContainerParams): RequestContainerMessage {
  return {type: "requestContainer", args: {containerId, loc}};
}

export function requestCreature({id}: Protocol.RequestCreatureParams): RequestCreatureMessage {
  return {type: "requestCreature", args: {id}};
}

export function requestPartition({w}: Protocol.RequestPartitionParams): RequestPartitionMessage {
  return {type: "requestPartition", args: {w}};
}

export function requestSector({...loc}: Protocol.RequestSectorParams): RequestSectorMessage {
  return {type: "requestSector", args: {...loc}};
}

export function tame({creatureId}: Protocol.TameParams): TameMessage {
  return {type: "tame", args: {creatureId}};
}

export function use({toolIndex, loc, usageIndex}: Protocol.UseParams): UseMessage {
  return {type: "use", args: {toolIndex, loc, usageIndex}};
}
