import Game from './game';

abstract class ClientModule {
  constructor(public game: Game) {}

  onStart() {
    // empty
  }

  // eslint-disable-next-line
  public onTick(now: number) {
    // empty
  }
}

export default ClientModule;
