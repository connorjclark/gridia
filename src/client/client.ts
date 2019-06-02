import { EventEmitter } from 'events';
import { Context } from '../context';

interface Settings {
  volume: number;
}

class Client {
  public PIXI: typeof import('pixi.js');
  public PIXISound: typeof import('pixi-sound');
  // TODO: keep references instead?
  public creatureId: number;
  public containerId: number;
  public context: Context;
  public eventEmitter = new EventEmitter();
  public settings: Settings = {
    volume: 0.6,
  };
}

export default Client;
