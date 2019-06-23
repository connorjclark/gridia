// Necessary evil to begin splitting the huge main.ts file into modules.

import Client from './client';
import Game from './game';

class God {
  // public client: Client;
  public game: Game;
}

export default new God();
