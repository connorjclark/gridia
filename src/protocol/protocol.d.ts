/*
  This is the source of truth for the protocol.
  Everything in gen/ is created by build-protocol.js
  The .ts files in this folder implement the files in gen/
*/

declare namespace ClientToServerProtocol {
  namespace Params {
    interface AdminSetFloor extends TilePoint {
      floor: number;
    }

    interface AdminSetItem extends TilePoint {
      item?: Item;
    }

    interface CloseContainer {
      containerId: number;
    }

    interface Move extends TilePoint {
    }

    interface MoveItem {
      from: ItemLocation;
      quantity?: number;
      to: ItemLocation;
    }

    interface Register {
      name: string;
      password: string;
    }

    interface Login {
      name: string;
      password: string;
    }

    interface RequestContainer {
      containerId?: number;
      loc?: TilePoint;
    }

    interface RequestCreature {
      id: number;
    }

    interface RequestPartition {
      w: number;
    }

    interface RequestSector extends TilePoint {
    }

    interface CreatureAction {
      creatureId: number;
      type: 'attack' | 'tame'
    }

    interface Use {
      toolIndex: number;
      location: ItemLocation;
      usageIndex?: number;
    }

    interface Chat {
      to: string;
      message: string;
    }
  }
}

declare namespace ServerToClientProtocol {
  namespace Params {
    interface Animation extends TilePoint {
      key: string;
    }

    interface Container {
      type: import('../container').ContainerType;
      id: number;
      items: Array<Item | null>;
    }

    interface Initialize {
      player: import('../player').default;
      secondsPerWorldTick: number;
      ticksPerWorldDay: number;
    }

    interface InitializePartition extends TilePoint {
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
      from: string;
      to: string;
      message: string;
    }

    interface Time {
      epoch: number;
    }
  }
}
