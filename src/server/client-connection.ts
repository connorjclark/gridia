import Container from '../container';
import Player from '../player';

// TODO: this whole thing smells.

export default class ClientConnection {
  messageQueue: Array<{type: string; args: Object}> = [];

  // @ts-ignore
  player: Player;

  // @ts-ignore
  container: Container;

  // @ts-ignore
  send: (message: ServerToClientMessage) => void;

  registeredContainers = [] as number[];

  getMessage() {
    return this.messageQueue.shift();
  }

  hasMessage(): boolean {
    return this.messageQueue.length > 0;
  }
}
