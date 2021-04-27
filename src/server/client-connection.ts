import { ProtocolEvent } from '../protocol/event-builder';

// TODO: this whole thing smells.

export default class ClientConnection {
  messageQueue: Message[] = [];
  // @ts-ignore
  account: GridiaAccount;
  // @ts-ignore
  player: Player;
  // @ts-ignore
  container: Container;
  // @ts-ignore
  equipment: Container;
  subscribedCreatureIds = new Set<number>();
  registeredContainers = [] as string[];
  activeDialogue?: { dialogue: Dialogue; partIndex: number };

  // @ts-ignore
  send: (message: Message) => void;

  sendEvent(event: ProtocolEvent) {
    this.send({ data: event });
  }

  getMessage() {
    return this.messageQueue.shift();
  }

  hasMessage(): boolean {
    return this.messageQueue.length > 0;
  }
}
