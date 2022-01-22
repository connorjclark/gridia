/* Auto generated by build/build-protocol.js */

import {Client} from '../../client/client.js'

export interface IEvents {
    onAnimation(client: Client, { ...animationInstance }: Protocol.Events.Animation): void;
    onContainer(client: Client, { container }: Protocol.Events.Container): void;
    onInitialize(client: Client, { player, creatureId, secondsPerWorldTick, ticksPerWorldDay }: Protocol.Events.Initialize): void;
    onInitializePartition(client: Client, { name, ...pos }: Protocol.Events.InitializePartition): void;
    onLog(client: Client, { msg }: Protocol.Events.Log): void;
    onRemoveCreature(client: Client, { id }: Protocol.Events.RemoveCreature): void;
    onSector(client: Client, { tiles, ...pos }: Protocol.Events.Sector): void;
    onSetCreature(client: Client, { partial, ...creature }: Protocol.Events.SetCreature): void;
    onSetFloor(client: Client, { floor, ...pos }: Protocol.Events.SetFloor): void;
    onSetItem(client: Client, { location, item }: Protocol.Events.SetItem): void;
    onXp(client: Client, { skill, xp }: Protocol.Events.Xp): void;
    onChat(client: Client, { section, from, creatureId, text }: Protocol.Events.Chat): void;
    onTime(client: Client, { epoch }: Protocol.Events.Time): void;
    onDialogue(client: Client, { dialogue, index }: Protocol.Events.Dialogue): void;
    onSetAttackTarget(client: Client, { creatureId }: Protocol.Events.SetAttackTarget): void;
    onCreatureStatus(client: Client, { creatureId, text, color }: Protocol.Events.CreatureStatus): void;
    onNotification(client: Client, { details }: Protocol.Events.Notification): void;
    onRawAnimation(client: Client, { pos, tint, path, light, offshootRate, frames }: Protocol.Events.RawAnimation): void;
}