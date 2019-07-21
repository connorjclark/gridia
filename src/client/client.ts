import { EventEmitter } from 'events';
import { Context } from '../context';

interface Settings {
  volume: number;
}

class Client {
  public wire: ClientToServerWire;
  public PIXI: typeof import('pixi.js');
  public PIXISound: typeof import('pixi-sound').default;
  public isAdmin: boolean;
  // TODO: keep references instead?
  public creatureId: number;
  public containerId: number;
  public context: Context;
  public eventEmitter = new EventEmitter();
  public settings: Settings = {
    volume: 0.6,
  };
  // skill id -> xp
  public skills: Map<number, number> = new Map();
}

export default Client;
