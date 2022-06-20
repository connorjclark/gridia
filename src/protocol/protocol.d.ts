/*
  This is the source of truth for the protocol.
  Everything in gen/ is created by build-protocol.js
  The .ts files in this folder implement the files in gen/
*/

type Container_ = Container;

type Message = { id?: number; data?: any; error?: {message: string; stack?: string} };
type MessageWithId = { id: number; data?: any; error?: {message: string; stack?: string} };

type Command<P, R = void> = {
  params: P;
  response: R;
};

declare namespace Protocol {
  namespace Commands {
    type AdminRequestPartitionMetas = Command<{}, PartitionMeta[]>;
    type AdminRequestScripts = Command<{}, ScriptState[]>;
    type AdminSetScriptConfig = Command<{ id: string; key?: string; value: any }>;
    type AdminSetFloor = Command<TilePoint & { floor: number }>;
    type AdminSetItem = Command<TilePoint & { item?: Item }>;
    type CastSpell = Command<{ id: number; creatureId?: number; pos?: Point4 }>;
    type Chat = Command<{ text: string }>;
    type CloseContainer = Command<{ containerId: string }>;
    type CreatePlayer = Command<{
      name: string,
      attributes: Map<string, number>,
      skills: Map<number, 'learn' | 'specialize'>,
    }>;
    type CreatureAction = Command<{ creatureId: number; type: 'attack' | 'tame' | 'speak' | 'trade' }>;
    type DialogueResponse = Command<{ choiceIndex?: number }>;
    type EnterWorld = Command<{ playerId: string }>;
    type Login = Command<
      { firebaseToken: string },
      { worldData: WorldDataDefinition; account: GridiaAccount; players: Player[]; graphics: Graphics[]; equipmentGraphics: Array<Graphics[]> }
    >;
    type Logout = Command<{}>;
    type Move = Command<TilePoint, { resetLocation?: Point4 }>;
    type MoveItem = Command<{ from: ItemLocation; quantity?: number; to: ItemLocation }>;
    type BuyItem = Command<{ from: ContainerLocation; quantity: number; price: number }>;
    type SellItem = Command<{ from: ContainerLocation; to: ContainerLocation; quantity: number; price: number }>;
    type RegisterAccount = Command<{ firebaseToken: string }>;
    type RequestContainer = Command<{ containerId?: string; pos?: TilePoint }>;
    type RequestCreature = Command<{ id: number }>;
    type RequestPartition = Command<{ w: number }, { name: string } & TilePoint>;
    type RequestSector = Command<TilePoint>;
    type Use = Command<{ toolIndex: number; location: ItemLocation; usageIndex?: number }>;
    type LearnSkill = Command<{ id: number }>;
    type IncrementAttribute = Command<{ name: string }>;
    type ReadItem = Command<{ location: ItemLocation }, { content: string }>;
    type EatItem = Command<{ location: ItemLocation }>;
    type ItemAction = Command<{ type: string; from: ItemLocation; to?: ItemLocation }>;
    type ContainerAction = Command<{ type: string; id: string }>;
    type SaveSettings = Command<{ settings: Settings }>;
    type CreatePartition = Command<{ tiles: Tile[]; width: number; height: number }>;
    type RawAnimation = Command<{ pos: TilePoint; tint: number; path: Point2[]; light: number; offshootRate: number; frames: GridiaAnimation['frames'] }>;
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
    }

    interface UpdateSessionState extends Partial<SessionState> {
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

    type SetCreature = Creature | {id: number; ops: SniffedOperation[]};
    type SetPlayer = Player | {ops: SniffedOperation[]};
    type SetSector = TilePoint & ({tiles: Tile[][]} | {ops: SniffedOperation[]});

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

    interface StartDialogue {
      // TODO: this should just be an array of ids
      speakers: Array<Pick<Creature, 'id'|'name'>>;
      dialogue: Dialogue;
      index: number;
      symbols: Set<string>;
    }

    interface UpdateDialogue {
      id: string;
      index: number;
      symbols: Set<string>;
    }

    interface CreatureStatus {
      creatureId: number;
      text: string;
      color?: string;
    }

    interface Notification {
      details: NotificationSkillLevelDetails | NotificationTextDetails;
    }

    interface RawAnimation {
      pos: TilePoint;
      tint: number;
      path: Point2[];
      light: number;
      offshootRate: number;
      frames: GridiaAnimation['frames'];
    }
  }
}

interface NotificationSkillLevelDetails {
  type: 'skill-level';
  skillId: number;
  from: number;
  to: number;
}

interface NotificationTextDetails {
  type: 'text';
  title?: string;
  text: string;
}
