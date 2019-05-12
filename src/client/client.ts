import { ClientWorldContext } from '../context';

class Client {
  public PIXI: typeof import('pixi.js');
  public PIXISound: typeof import('pixi-sound');
  // TODO: keep references instead?
  public creatureId: number;
  public containerId: number;
  public world: ClientWorldContext;
}

export default Client;
