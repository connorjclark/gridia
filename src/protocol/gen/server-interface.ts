/* Auto generated by build/build-protocol.js */

import {ClientConnection} from '../../server/client-connection.js';
import {Server} from '../../server/server.js'

export interface ICommands {
    onAdminRequestPartitionMetas(server: Server, clientConnection: ClientConnection, {}: Protocol.Commands.AdminRequestPartitionMetas["params"]): Promise<Protocol.Commands.AdminRequestPartitionMetas["response"]>;
    onAdminRequestScripts(server: Server, clientConnection: ClientConnection, {}: Protocol.Commands.AdminRequestScripts["params"]): Promise<Protocol.Commands.AdminRequestScripts["response"]>;
    onAdminSetScriptConfig(server: Server, clientConnection: ClientConnection, { id, key, value }: Protocol.Commands.AdminSetScriptConfig["params"]): Promise<Protocol.Commands.AdminSetScriptConfig["response"]>;
    onAdminSetFloor(server: Server, clientConnection: ClientConnection, { floor, ...pos }: Protocol.Commands.AdminSetFloor["params"]): Promise<Protocol.Commands.AdminSetFloor["response"]>;
    onAdminSetItem(server: Server, clientConnection: ClientConnection, { item, ...pos }: Protocol.Commands.AdminSetItem["params"]): Promise<Protocol.Commands.AdminSetItem["response"]>;
    onCastSpell(server: Server, clientConnection: ClientConnection, { id, creatureId, pos }: Protocol.Commands.CastSpell["params"]): Promise<Protocol.Commands.CastSpell["response"]>;
    onChat(server: Server, clientConnection: ClientConnection, { text }: Protocol.Commands.Chat["params"]): Promise<Protocol.Commands.Chat["response"]>;
    onCloseContainer(server: Server, clientConnection: ClientConnection, { containerId }: Protocol.Commands.CloseContainer["params"]): Promise<Protocol.Commands.CloseContainer["response"]>;
    onCreatePlayer(server: Server, clientConnection: ClientConnection, { name, attributes, skills }: Protocol.Commands.CreatePlayer["params"]): Promise<Protocol.Commands.CreatePlayer["response"]>;
    onCreatureAction(server: Server, clientConnection: ClientConnection, { creatureId, type }: Protocol.Commands.CreatureAction["params"]): Promise<Protocol.Commands.CreatureAction["response"]>;
    onDialogueResponse(server: Server, clientConnection: ClientConnection, { choiceIndex }: Protocol.Commands.DialogueResponse["params"]): Promise<Protocol.Commands.DialogueResponse["response"]>;
    onEnterWorld(server: Server, clientConnection: ClientConnection, { playerId }: Protocol.Commands.EnterWorld["params"]): Promise<Protocol.Commands.EnterWorld["response"]>;
    onLogin(server: Server, clientConnection: ClientConnection, { firebaseToken }: Protocol.Commands.Login["params"]): Promise<Protocol.Commands.Login["response"]>;
    onLogout(server: Server, clientConnection: ClientConnection, {}: Protocol.Commands.Logout["params"]): Promise<Protocol.Commands.Logout["response"]>;
    onMove(server: Server, clientConnection: ClientConnection, { ...pos }: Protocol.Commands.Move["params"]): Promise<Protocol.Commands.Move["response"]>;
    onMoveItem(server: Server, clientConnection: ClientConnection, { from, quantity, to }: Protocol.Commands.MoveItem["params"]): Promise<Protocol.Commands.MoveItem["response"]>;
    onBuyItem(server: Server, clientConnection: ClientConnection, { from, quantity, price }: Protocol.Commands.BuyItem["params"]): Promise<Protocol.Commands.BuyItem["response"]>;
    onSellItem(server: Server, clientConnection: ClientConnection, { from, to, quantity, price }: Protocol.Commands.SellItem["params"]): Promise<Protocol.Commands.SellItem["response"]>;
    onRegisterAccount(server: Server, clientConnection: ClientConnection, { firebaseToken }: Protocol.Commands.RegisterAccount["params"]): Promise<Protocol.Commands.RegisterAccount["response"]>;
    onRequestContainer(server: Server, clientConnection: ClientConnection, { containerId, pos }: Protocol.Commands.RequestContainer["params"]): Promise<Protocol.Commands.RequestContainer["response"]>;
    onRequestCreature(server: Server, clientConnection: ClientConnection, { id }: Protocol.Commands.RequestCreature["params"]): Promise<Protocol.Commands.RequestCreature["response"]>;
    onRequestPartition(server: Server, clientConnection: ClientConnection, { w }: Protocol.Commands.RequestPartition["params"]): Promise<Protocol.Commands.RequestPartition["response"]>;
    onRequestSector(server: Server, clientConnection: ClientConnection, { ...pos }: Protocol.Commands.RequestSector["params"]): Promise<Protocol.Commands.RequestSector["response"]>;
    onUse(server: Server, clientConnection: ClientConnection, { toolIndex, location, usageIndex }: Protocol.Commands.Use["params"]): Promise<Protocol.Commands.Use["response"]>;
    onLearnSkill(server: Server, clientConnection: ClientConnection, { id }: Protocol.Commands.LearnSkill["params"]): Promise<Protocol.Commands.LearnSkill["response"]>;
    onIncrementAttribute(server: Server, clientConnection: ClientConnection, { name }: Protocol.Commands.IncrementAttribute["params"]): Promise<Protocol.Commands.IncrementAttribute["response"]>;
    onReadItem(server: Server, clientConnection: ClientConnection, { location }: Protocol.Commands.ReadItem["params"]): Promise<Protocol.Commands.ReadItem["response"]>;
    onEatItem(server: Server, clientConnection: ClientConnection, { location }: Protocol.Commands.EatItem["params"]): Promise<Protocol.Commands.EatItem["response"]>;
    onItemAction(server: Server, clientConnection: ClientConnection, { type, from, to }: Protocol.Commands.ItemAction["params"]): Promise<Protocol.Commands.ItemAction["response"]>;
    onContainerAction(server: Server, clientConnection: ClientConnection, { type, id }: Protocol.Commands.ContainerAction["params"]): Promise<Protocol.Commands.ContainerAction["response"]>;
    onSaveSettings(server: Server, clientConnection: ClientConnection, { settings }: Protocol.Commands.SaveSettings["params"]): Promise<Protocol.Commands.SaveSettings["response"]>;
    onCreatePartition(server: Server, clientConnection: ClientConnection, { tiles, width, height }: Protocol.Commands.CreatePartition["params"]): Promise<Protocol.Commands.CreatePartition["response"]>;
    onRawAnimation(server: Server, clientConnection: ClientConnection, { pos, tint, path, light, offshootRate, frames }: Protocol.Commands.RawAnimation["params"]): Promise<Protocol.Commands.RawAnimation["response"]>;
}