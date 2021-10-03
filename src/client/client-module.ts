import {Game} from './game.js';

export abstract class ClientModule {
  constructor(public game: Game) {}

  onStart() {
    // empty
  }

  // eslint-disable-next-line
  public onTick(now: number) {
    // empty
  }
}
