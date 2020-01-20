/* Auto generated by build/build-protocol.js */

import Client from '../../client/client'

export default interface IServerToClientProtocol {
    onAnimation(client: Client, { key, ...loc }: ServerToClientProtocol.Params.Animation): void;
    onContainer(client: Client, { id, items }: ServerToClientProtocol.Params.Container): void;
    onInitialize(client: Client, { isAdmin, creatureId, containerId, skills }: ServerToClientProtocol.Params.Initialize): void;
    onInitializePartition(client: Client, { ...loc }: ServerToClientProtocol.Params.InitializePartition): void;
    onLog(client: Client, { msg }: ServerToClientProtocol.Params.Log): void;
    onRemoveCreature(client: Client, { id }: ServerToClientProtocol.Params.RemoveCreature): void;
    onSector(client: Client, { tiles, ...loc }: ServerToClientProtocol.Params.Sector): void;
    onSetCreature(client: Client, { partial, ...creature }: ServerToClientProtocol.Params.SetCreature): void;
    onSetFloor(client: Client, { floor, ...loc }: ServerToClientProtocol.Params.SetFloor): void;
    onSetItem(client: Client, { item, source, ...loc }: ServerToClientProtocol.Params.SetItem): void;
    onXp(client: Client, { skill, xp }: ServerToClientProtocol.Params.Xp): void;
    onChat(client: Client, { from, to, message }: ServerToClientProtocol.Params.Chat): void;
}