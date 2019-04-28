import * as _PIXISound from 'pixi-sound';
import * as PIXI from 'pixi.js';
import { ClientWorldContext } from '../context';

class Client {
  public PIXI: typeof PIXI;
  public PIXISound: typeof _PIXISound;
  public creatureId: number;
  public world: ClientWorldContext;
}

export default Client;
