import { ClientWorldContext } from '../context';

class Client {
  public PIXI: typeof import('pixi.js');
  public PIXISound: typeof import('pixi-sound');
  public creatureId: number;
  public world: ClientWorldContext;
}

export default Client;
