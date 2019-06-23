import Game from './game';

abstract class ClientModule {
  constructor(public game: Game) {}

  public onStart() {
    // empty
  }

  public onTick() {
    // empty
  }
}

export default ClientModule;
