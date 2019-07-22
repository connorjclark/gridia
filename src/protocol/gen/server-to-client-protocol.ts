/* tslint:disable */
import Client from '../../client/client';
import Container from '../../container';

export interface AnimationParams extends TilePoint {
  key: string;
}

export interface ContainerParams extends NoMethods<Container> {
}

export interface InitializeParams {
  isAdmin: boolean;
  creatureId: number;
  containerId: number;
  skills: Array<[number, number]>;
}

export interface InitializePartitionParams extends TilePoint {
}

export interface LogParams {
  msg: string;
}

export interface RemoveCreatureParams {
  id: number;
}

export interface SectorParams extends TilePoint {
  tiles: Sector;
}

export interface SetCreatureParams extends Partial<Creature> {
  partial: boolean;
}

export interface SetFloorParams extends TilePoint {
  floor: number;
}

export interface SetItemParams extends TilePoint {
  item?: Item;
  source: number;
}

export interface XpParams {
  skill: number;
  xp: number;
}

export interface ServerToClientProtocol {
  onAnimation(client: Client, {key, ...loc}: AnimationParams): void;
  onContainer(client: Client, {...container}: ContainerParams): void;
  onInitialize(client: Client, {isAdmin, creatureId, containerId, skills}: InitializeParams): void;
  onInitializePartition(client: Client, {...pos}: InitializePartitionParams): void;
  onLog(client: Client, {msg}: LogParams): void;
  onRemoveCreature(client: Client, {id}: RemoveCreatureParams): void;
  onSector(client: Client, {tiles, ...pos}: SectorParams): void;
  onSetCreature(client: Client, {partial, ...partialCreature}: SetCreatureParams): void;
  onSetFloor(client: Client, {floor, ...loc}: SetFloorParams): void;
  onSetItem(client: Client, {item, source, ...loc}: SetItemParams): void;
  onXp(client: Client, {skill, xp}: XpParams): void;
}
