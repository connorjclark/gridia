export default class ClientConnection {
  public messageQueue: any[] = [];

  public creature: Creature;

  // True if last movement was a warp. Prevents infinite stairs.
  public warped: boolean;

  public send: WireMethod<typeof import('../protocol')['ServerToClientProtocol']>;

  public getMessage(): any {
    return this.messageQueue.shift();
  }

  public hasMessage(): boolean {
    return this.messageQueue.length > 0;
  }
}
