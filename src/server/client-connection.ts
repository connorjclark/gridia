import {ProtocolEvent} from '../protocol/event-builder.js';

// TODO: this whole thing smells.

export class ClientConnection {
  messageQueue: Message[] = [];
  // @ts-expect-error
  account: GridiaAccount;
  // @ts-expect-error
  player: Player;
  // @ts-expect-error
  creature: Creature;
  // @ts-expect-error
  container: Container;
  // @ts-expect-error
  equipment: Container;
  subscribedCreatureIds = new Set<number>();
  registeredContainers = [] as string[];
  activeDialogue?: { dialogue: Dialogue; partIndex: number };

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
