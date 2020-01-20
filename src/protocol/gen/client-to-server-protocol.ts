/* Auto generated by build/build-protocol.js */

import Server from '../../server/server'

export default interface IClientToServerProtocol {
    onAdminSetFloor(server: Server, { floor, ...loc }: ClientToServerProtocol.Params.AdminSetFloor): void;
    onAdminSetItem(server: Server, { item, ...loc }: ClientToServerProtocol.Params.AdminSetItem): void;
    onCloseContainer(server: Server, { containerId }: ClientToServerProtocol.Params.CloseContainer): void;
    onMove(server: Server, { ...loc }: ClientToServerProtocol.Params.Move): void;
    onMoveItem(server: Server, { from, fromSource, to, toSource }: ClientToServerProtocol.Params.MoveItem): void;
    onRegister(server: Server, { name }: ClientToServerProtocol.Params.Register): void;
    onRequestContainer(server: Server, { containerId, loc }: ClientToServerProtocol.Params.RequestContainer): void;
    onRequestCreature(server: Server, { id }: ClientToServerProtocol.Params.RequestCreature): void;
    onRequestPartition(server: Server, { w }: ClientToServerProtocol.Params.RequestPartition): void;
    onRequestSector(server: Server, { ...loc }: ClientToServerProtocol.Params.RequestSector): void;
    onTame(server: Server, { creatureId }: ClientToServerProtocol.Params.Tame): void;
    onUse(server: Server, { toolIndex, loc, usageIndex }: ClientToServerProtocol.Params.Use): void;
    onChat(server: Server, { to, message }: ClientToServerProtocol.Params.Chat): void;
}