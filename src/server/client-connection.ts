import {ProtocolEvent} from '../protocol/event-builder.js';

type PartialRequired<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: T[P];
};

export type PlayerConnection =
  PartialRequired<ClientConnection, 'account' | 'player' | 'creature' | 'container' | 'equipment'>;

export class ClientConnection {
  messageQueue: Message[] = [];
  account?: GridiaAccount;
  player?: Player;
  creature?: Creature;
  container?: Container;
  equipment?: Container;
  subscribedCreatureIds = new Set<number>();
  registeredContainers = [] as string[];
  activeDialogue?: { dialogue: Dialogue; partIndex: number; partIndexStack: number[]; symbols: Set<string> };

  isPlayerConnection(this: ClientConnection): this is PlayerConnection {
    if (this.account && this.player && this.creature && this.container && this.equipment) {
      return true;
    }

    return false;
  }

  ensurePlayerConnection(this: ClientConnection): PlayerConnection {
    if (this.isPlayerConnection()) return this;
    throw new Error('not a player connection');
  }

  assertsPlayerConnection(this: ClientConnection): asserts this is PlayerConnection {
    if (!this.isPlayerConnection()) throw new Error('not a player connection');
  }

  // @ts-expect-error
  send: (message: Message) => void;

  sendEvent(event: ProtocolEvent) {
    this.send({data: event});
  }

  getMessage() {
    return this.messageQueue.shift();
  }

  hasMessage(): boolean {
    return this.messageQueue.length > 0;
  }
}
