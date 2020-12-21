import Game from './game';

abstract class ClientModule {
  public constructor(public game: Game) {}

  public onStart() {
    // empty
  }

  // eslint-disable-next-line
  public onTick(now: number) {
    // empty
  }
}

export default ClientModule;
