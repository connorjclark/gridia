import Game from './game';

abstract class ClientModule {
  constructor(public game: Game) {}

  public onStart() {
    // empty
  }

  public onTick(now: number) {
    // empty
  }
}

export default ClientModule;
