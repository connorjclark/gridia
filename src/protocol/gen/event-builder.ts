/* Auto generated by build/build-protocol.js */

type AnimationEvent = {
    type: "animation";
    args: Protocol.Events.Animation;
};
type ContainerEvent = {
    type: "container";
    args: Protocol.Events.Container;
};
type InitializeEvent = {
    type: "initialize";
    args: Protocol.Events.Initialize;
};
type InitializePartitionEvent = {
    type: "initializePartition";
    args: Protocol.Events.InitializePartition;
};
type LogEvent = {
    type: "log";
    args: Protocol.Events.Log;
};
type RemoveCreatureEvent = {
    type: "removeCreature";
    args: Protocol.Events.RemoveCreature;
};
type SectorEvent = {
    type: "sector";
    args: Protocol.Events.Sector;
};
type SetCreatureEvent = {
    type: "setCreature";
    args: Protocol.Events.SetCreature;
};
type SetFloorEvent = {
    type: "setFloor";
    args: Protocol.Events.SetFloor;
};
type SetItemEvent = {
    type: "setItem";
    args: Protocol.Events.SetItem;
};
type XpEvent = {
    type: "xp";
    args: Protocol.Events.Xp;
};
type ChatEvent = {
    type: "chat";
    args: Protocol.Events.Chat;
};
type TimeEvent = {
    type: "time";
    args: Protocol.Events.Time;
};
type StartDialogueEvent = {
    type: "startDialogue";
    args: Protocol.Events.StartDialogue;
};
type UpdateDialogueEvent = {
    type: "updateDialogue";
    args: Protocol.Events.UpdateDialogue;
};
type SetAttackTargetEvent = {
    type: "setAttackTarget";
    args: Protocol.Events.SetAttackTarget;
};
type CreatureStatusEvent = {
    type: "creatureStatus";
    args: Protocol.Events.CreatureStatus;
};
type NotificationEvent = {
    type: "notification";
    args: Protocol.Events.Notification;
};
type RawAnimationEvent = {
    type: "rawAnimation";
    args: Protocol.Events.RawAnimation;
};

export type ProtocolEvent = AnimationEvent | ContainerEvent | InitializeEvent | InitializePartitionEvent | LogEvent | RemoveCreatureEvent | SectorEvent | SetCreatureEvent | SetFloorEvent | SetItemEvent | XpEvent | ChatEvent | TimeEvent | StartDialogueEvent | UpdateDialogueEvent | SetAttackTargetEvent | CreatureStatusEvent | NotificationEvent | RawAnimationEvent;

export function animation({ ...animationInstance }: Protocol.Events.Animation): AnimationEvent {
    return { type: "animation", args: arguments[0] };
}
export function container({ container }: Protocol.Events.Container): ContainerEvent {
    return { type: "container", args: arguments[0] };
}
export function initialize({ player, creatureId, secondsPerWorldTick, ticksPerWorldDay }: Protocol.Events.Initialize): InitializeEvent {
    return { type: "initialize", args: arguments[0] };
}
export function initializePartition({ name, ...pos }: Protocol.Events.InitializePartition): InitializePartitionEvent {
    return { type: "initializePartition", args: arguments[0] };
}
export function log({ msg }: Protocol.Events.Log): LogEvent {
    return { type: "log", args: arguments[0] };
}
export function removeCreature({ id }: Protocol.Events.RemoveCreature): RemoveCreatureEvent {
    return { type: "removeCreature", args: arguments[0] };
}
export function sector({ tiles, ...pos }: Protocol.Events.Sector): SectorEvent {
    return { type: "sector", args: arguments[0] };
}
export function setCreature({ partial, ...creature }: Protocol.Events.SetCreature): SetCreatureEvent {
    return { type: "setCreature", args: arguments[0] };
}
export function setFloor({ floor, ...pos }: Protocol.Events.SetFloor): SetFloorEvent {
    return { type: "setFloor", args: arguments[0] };
}
export function setItem({ location, item }: Protocol.Events.SetItem): SetItemEvent {
    return { type: "setItem", args: arguments[0] };
}
export function xp({ skill, xp }: Protocol.Events.Xp): XpEvent {
    return { type: "xp", args: arguments[0] };
}
export function chat({ section, from, creatureId, text }: Protocol.Events.Chat): ChatEvent {
    return { type: "chat", args: arguments[0] };
}
export function time({ epoch }: Protocol.Events.Time): TimeEvent {
    return { type: "time", args: arguments[0] };
}
export function startDialogue({ speakers, dialogue }: Protocol.Events.StartDialogue): StartDialogueEvent {
    return { type: "startDialogue", args: arguments[0] };
}
export function updateDialogue({ id, index, symbols }: Protocol.Events.UpdateDialogue): UpdateDialogueEvent {
    return { type: "updateDialogue", args: arguments[0] };
}
export function setAttackTarget({ creatureId }: Protocol.Events.SetAttackTarget): SetAttackTargetEvent {
    return { type: "setAttackTarget", args: arguments[0] };
}
export function creatureStatus({ creatureId, text, color }: Protocol.Events.CreatureStatus): CreatureStatusEvent {
    return { type: "creatureStatus", args: arguments[0] };
}
export function notification({ details }: Protocol.Events.Notification): NotificationEvent {
    return { type: "notification", args: arguments[0] };
}
export function rawAnimation({ pos, tint, path, light, offshootRate, frames }: Protocol.Events.RawAnimation): RawAnimationEvent {
    return { type: "rawAnimation", args: arguments[0] };
}