import Container from '../container';
import Player from '../player';

export default class ClientConnection {
  public messageQueue: any[] = [];

  public player: Player;

  public container: Container;

  public send: WireMethod<typeof import('../protocol')['ServerToClientProtocol']>;

  public registeredContainers = [] as number[];

  public getMessage(): any {
    return this.messageQueue.shift();
  }

  public hasMessage(): boolean {
    return this.messageQueue.length > 0;
  }
}
