export default class ClientConnection {
  public messageQueue: any[] = [];

  public creature: Creature;

  public send: WireMethod<typeof import('../protocol')['ServerToClientProtocol']>;

  public getMessage(): any {
    return this.messageQueue.shift();
  }

  public hasMessage(): boolean {
    return this.messageQueue.length > 0;
  }
}
