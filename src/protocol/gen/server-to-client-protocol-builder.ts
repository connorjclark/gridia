/* tslint:disable */
import * as Protocol from './server-to-client-protocol';

type AnimationMessage = {type: "animation", args: Protocol.AnimationParams}
type ContainerMessage = {type: "container", args: Protocol.ContainerParams}
type InitializeMessage = {type: "initialize", args: Protocol.InitializeParams}
type InitializePartitionMessage = {type: "initializePartition", args: Protocol.InitializePartitionParams}
type LogMessage = {type: "log", args: Protocol.LogParams}
type RemoveCreatureMessage = {type: "removeCreature", args: Protocol.RemoveCreatureParams}
type SectorMessage = {type: "sector", args: Protocol.SectorParams}
type SetCreatureMessage = {type: "setCreature", args: Protocol.SetCreatureParams}
type SetFloorMessage = {type: "setFloor", args: Protocol.SetFloorParams}
type SetItemMessage = {type: "setItem", args: Protocol.SetItemParams}
type XpMessage = {type: "xp", args: Protocol.XpParams}

export type Message = AnimationMessage
  | ContainerMessage
  | InitializeMessage
  | InitializePartitionMessage
  | LogMessage
  | RemoveCreatureMessage
  | SectorMessage
  | SetCreatureMessage
  | SetFloorMessage
  | SetItemMessage
  | XpMessage

export function animation({key, ...loc}: Protocol.AnimationParams): AnimationMessage {
  return {type: "animation", args: {key, ...loc}};
}

export function container({...container}: Protocol.ContainerParams): ContainerMessage {
  return {type: "container", args: {...container}};
}

export function initialize({isAdmin, creatureId, containerId, skills}: Protocol.InitializeParams): InitializeMessage {
  return {type: "initialize", args: {isAdmin, creatureId, containerId, skills}};
}

export function initializePartition({...pos}: Protocol.InitializePartitionParams): InitializePartitionMessage {
  return {type: "initializePartition", args: {...pos}};
}

export function log({msg}: Protocol.LogParams): LogMessage {
  return {type: "log", args: {msg}};
}

export function removeCreature({id}: Protocol.RemoveCreatureParams): RemoveCreatureMessage {
  return {type: "removeCreature", args: {id}};
}

export function sector({tiles, ...pos}: Protocol.SectorParams): SectorMessage {
  return {type: "sector", args: {tiles, ...pos}};
}

export function setCreature({partial, ...partialCreature}: Protocol.SetCreatureParams): SetCreatureMessage {
  return {type: "setCreature", args: {partial, ...partialCreature}};
}

export function setFloor({floor, ...loc}: Protocol.SetFloorParams): SetFloorMessage {
  return {type: "setFloor", args: {floor, ...loc}};
}

export function setItem({item, source, ...loc}: Protocol.SetItemParams): SetItemMessage {
  return {type: "setItem", args: {item, source, ...loc}};
}

export function xp({skill, xp}: Protocol.XpParams): XpMessage {
  return {type: "xp", args: {skill, xp}};
}
