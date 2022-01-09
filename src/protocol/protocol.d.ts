/*
  This is the source of truth for the protocol.
  Everything in gen/ is created by build-protocol.js
  The .ts files in this folder implement the files in gen/
*/

type Container_ = Container;

type Message = { id?: number; data: any };

type Command<P, R = void> = {
  params: P;
  response: R;
};

declare namespace Protocol {
  namespace Commands {
    type AdminRequestPartitionMetas = Command<{}, PartitionMeta[]>;
    type AdminRequestScripts = Command<{}, ScriptState[]>;
    type AdminSetFloor = Command<TilePoint & { floor: number }>;
    type AdminSetItem = Command<TilePoint & { item?: Item }>;
    type CastSpell = Command<{ id: number; creatureId?: number; pos?: Point4 }>;
    type Chat = Command<{ text: string }>;
    type CloseContainer = Command<{ containerId: string }>;
    type CreatePlayer = Command<{
      name: string,
      attributes: Map<string, number>,
      skills: Set<number>,
    }>;
    type CreatureAction = Command<{ creatureId: number; type: 'attack' | 'tame' | 'speak' }>;
    type DialogueResponse = Command<{ choiceIndex?: number }>;
    type EnterWorld = Command<{ playerId: string }>;
    type Login = Command<
      { firebaseToken: string },
      { worldData: WorldDataDefinition; account: GridiaAccount; players: Player[]; graphics: Graphics[]; equipmentGraphics: Array<Graphics[]> }
    >;
    type Logout = Command<{}>;
    type Move = Command<TilePoint>;
    type MoveItem = Command<{ from: ItemLocation; quantity?: number; to: ItemLocation }>;
    type RegisterAccount = Command<{ firebaseToken: string }>;
    type RequestContainer = Command<{ containerId?: string; pos?: TilePoint }>;
    type RequestCreature = Command<{ id: number }>;
    type RequestPartition = Command<{ w: number }>;
    type RequestSector = Command<TilePoint>;
    type Use = Command<{ toolIndex: number; location: ItemLocation; usageIndex?: number }>;
    type LearnSkill = Command<{ id: number }>;
    type ReadItem = Command<{ location: ItemLocation }, { content: string }>;
    type EatItem = Command<{ location: ItemLocation }>;
    type ItemAction = Command<{ type: string; from: ItemLocation; to?: ItemLocation }>;
    type ContainerAction = Command<{ type: string; id: string }>;
    type SaveSettings = Command<{ settings: Settings }>;
    type CreatePartition = Command<{ tiles: Tile[]; width: number; height: number }>;
  }

  namespace Events {
    type Animation = GridiaAnimationInstance;

    interface Container {
      container: Container_;
    }

    interface Initialize {
      player: Player;
      creatureId: number;
      // TODO: move to Login
      secondsPerWorldTick: number;
      ticksPerWorldDay: number;
      // quests: Array<{id: string, name: string, started: boolean}>;
    }

    interface InitializePartition extends TilePoint {
      name: string;
    }

    interface Log {
      msg: string;
    }

    interface RemoveCreature {
      id: number;
    }

    interface Sector extends TilePoint {
      tiles: Tile[][];
    }

    interface SetCreature extends Partial<Creature> {
      partial: boolean;
    }

    interface SetFloor extends TilePoint {
      floor: number;
    }

    interface SetItem {
      location: ItemLocation;
      item?: Item;
    }

    interface Xp {
      skill: number;
      xp: number;
    }

    interface Chat {
      section: string;
      from?: string;
      creatureId?: number;
      text: string;
    }

    interface Time {
      epoch: number;
    }

    interface Dialogue {
      dialogue?: {
        speakers: Creature[];
        parts: DialoguePart[];
      }
      index: number;
    }

    interface SetAttackTarget {
      creatureId: number | null;
    }

    interface CreatureStatus {
      creatureId: number;
      text: string;
      color?: string;
    }

    interface Notifaction {
      details: NotifactionSkillLevelDetails | NotifactionTextDetails;
    }
  }
}

interface NotifactionSkillLevelDetails {
  type: 'skill-level';
  skillId: number;
  from: number;
  to: number;
}

interface NotifactionTextDetails {
  type: 'text';
  text: string;
}
