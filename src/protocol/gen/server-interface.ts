/* Auto generated by build/build-protocol.js */

import {ClientConnection} from '../../server/client-connection.js';
import {Server} from '../../server/server.js'

export interface ICommands {
    onAdminSetFloor(server: Server, clientConnection: ClientConnection, { floor, ...loc }: Protocol.Commands.AdminSetFloor["params"]): Promise<Protocol.Commands.AdminSetFloor["response"]>;
    onAdminSetItem(server: Server, clientConnection: ClientConnection, { item, ...loc }: Protocol.Commands.AdminSetItem["params"]): Promise<Protocol.Commands.AdminSetItem["response"]>;
    onCastSpell(server: Server, clientConnection: ClientConnection, { id, creatureId, loc }: Protocol.Commands.CastSpell["params"]): Promise<Protocol.Commands.CastSpell["response"]>;
    onChat(server: Server, clientConnection: ClientConnection, { text }: Protocol.Commands.Chat["params"]): Promise<Protocol.Commands.Chat["response"]>;
    onCloseContainer(server: Server, clientConnection: ClientConnection, { containerId }: Protocol.Commands.CloseContainer["params"]): Promise<Protocol.Commands.CloseContainer["response"]>;
    onCreatePlayer(server: Server, clientConnection: ClientConnection, { name, attributes, skills }: Protocol.Commands.CreatePlayer["params"]): Promise<Protocol.Commands.CreatePlayer["response"]>;
    onCreatureAction(server: Server, clientConnection: ClientConnection, { creatureId, type }: Protocol.Commands.CreatureAction["params"]): Promise<Protocol.Commands.CreatureAction["response"]>;
    onDialogueResponse(server: Server, clientConnection: ClientConnection, { choiceIndex }: Protocol.Commands.DialogueResponse["params"]): Promise<Protocol.Commands.DialogueResponse["response"]>;
    onEnterWorld(server: Server, clientConnection: ClientConnection, { playerId }: Protocol.Commands.EnterWorld["params"]): Promise<Protocol.Commands.EnterWorld["response"]>;
    onLogin(server: Server, clientConnection: ClientConnection, { firebaseToken }: Protocol.Commands.Login["params"]): Promise<Protocol.Commands.Login["response"]>;
    onLogout(server: Server, clientConnection: ClientConnection, {}: Protocol.Commands.Logout["params"]): Promise<Protocol.Commands.Logout["response"]>;
    onMove(server: Server, clientConnection: ClientConnection, { ...loc }: Protocol.Commands.Move["params"]): Promise<Protocol.Commands.Move["response"]>;
    onMoveItem(server: Server, clientConnection: ClientConnection, { from, quantity, to }: Protocol.Commands.MoveItem["params"]): Promise<Protocol.Commands.MoveItem["response"]>;
    onRegisterAccount(server: Server, clientConnection: ClientConnection, { firebaseToken }: Protocol.Commands.RegisterAccount["params"]): Promise<Protocol.Commands.RegisterAccount["response"]>;
    onRequestContainer(server: Server, clientConnection: ClientConnection, { containerId, loc }: Protocol.Commands.RequestContainer["params"]): Promise<Protocol.Commands.RequestContainer["response"]>;
    onRequestCreature(server: Server, clientConnection: ClientConnection, { id }: Protocol.Commands.RequestCreature["params"]): Promise<Protocol.Commands.RequestCreature["response"]>;
    onRequestPartition(server: Server, clientConnection: ClientConnection, { w }: Protocol.Commands.RequestPartition["params"]): Promise<Protocol.Commands.RequestPartition["response"]>;
    onRequestSector(server: Server, clientConnection: ClientConnection, { ...loc }: Protocol.Commands.RequestSector["params"]): Promise<Protocol.Commands.RequestSector["response"]>;
    onUse(server: Server, clientConnection: ClientConnection, { toolIndex, location, usageIndex }: Protocol.Commands.Use["params"]): Promise<Protocol.Commands.Use["response"]>;
    onLearnSkill(server: Server, clientConnection: ClientConnection, { id }: Protocol.Commands.LearnSkill["params"]): Promise<Protocol.Commands.LearnSkill["response"]>;
    onRequestScripts(server: Server, clientConnection: ClientConnection, {}: Protocol.Commands.RequestScripts["params"]): Promise<Protocol.Commands.RequestScripts["response"]>;
    onReadItem(server: Server, clientConnection: ClientConnection, { location }: Protocol.Commands.ReadItem["params"]): Promise<Protocol.Commands.ReadItem["response"]>;
}