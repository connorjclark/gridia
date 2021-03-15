import Container from '../container';
import Player from '../player';
import { Event } from '../protocol/event-builder';

// TODO: this whole thing smells.

export default class ClientConnection {
  messageQueue: Message[] = [];
  // @ts-ignore
  player: Player;
  // @ts-ignore
  container: Container;
  // @ts-ignore
  equipment: Container;
  subscribedCreatureIds = new Set<number>();
  registeredContainers = [] as number[];
  activeDialogue?: { dialogue: Dialogue; partIndex: number };

  // @ts-ignore
  send: (message: Message) => void;

  sendEvent(event: Event) {
    this.send({ data: event });
  }

  getMessage() {
    return this.messageQueue.shift();
  }

  hasMessage(): boolean {
    return this.messageQueue.length > 0;
  }
}
