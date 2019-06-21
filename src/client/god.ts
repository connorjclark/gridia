// Necessary evil to begin splitting the huge main.ts file into modules.

import Client from './client';

class God {
  public client: Client;
  public game: any;
  public state: UIState;
  public wire: ClientToServerWire;
}

export default new God();
