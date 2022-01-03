import {PlayerConnection} from './client-connection.js';
import {Script} from './script.js';
import {Server} from './server.js';

export class ScriptManager {
  private _scripts: Array<Script<any>> = [];

  // TODO: should all of these delegates be async/await'd?
  delegates = {
    onPlayerCreated: (player: Player, playerConnection: PlayerConnection) => {
      this.forRunningScripts((script) => script.onPlayerCreated(player, playerConnection));
    },
    onPlayerEnterWorld: (player: Player, playerConnection: PlayerConnection) => {
      this.forRunningScripts((script) => script.onPlayerEnterWorld(player, playerConnection));
    },
    onPlayerKillCreature: (player: Player, creature: Creature) => {
      this.forRunningScripts((script) => script.onPlayerKillCreature(player, creature));
    },
    onPlayerMove: (opts: { playerConnection: PlayerConnection; from: Point4; to: Point4 }) => {
      Object.freeze(opts);
      this.forRunningScripts((script) => script.onPlayerMove(opts));
    },
    onItemAction: (opts:
    { playerConnection: PlayerConnection; type: string; location: ItemLocation; to?: ItemLocation }) => {
      Object.freeze(opts);
      this.forRunningScripts((script) => script.onItemAction(opts));
    },
  };

  constructor(private server: Server) {
  }

  async tick() {
    for (const script of this._scripts) {
      if (script.state === 'starting') {
        try {
          await script.onStart();
          script.state = 'running';
        } catch (e: any) {
          script.state = 'failed';
          console.error(`Failed to start script ${script.id}`);
          console.error(e);
          script.addError(e);
        }
      } else if (script.state === 'running') {
        await script.tryCatchFn(() => script.tick());
      } else if (script.state === 'failed' || script.state === 'stopping') {
        script.state = 'stopped';
        await script.tryCatchFn(() => script.onStop());
        script.unload();
      }
    }
  }

  /**
   * Sets all scripts to 'starting' state.
   * The real work only happens in the next tick.
   */
  start() {
    for (const script of this._scripts) {
      script.state = 'starting';
    }
  }

  /**
   * Sets all scripts to 'stopped' state.
   * The real work also happens (all scripts will unload and have onStop called).
   */
  async stop() {
    for (const script of this._scripts) {
      script.state = 'stopping';
    }
    await this.tick();
  }

  getScriptStates(): ScriptState[] {
    return this._scripts.map((s) => s.getScriptState());
  }

  addScript(ScriptClass: new (...args: any) => Script<any>) {
    const script = new ScriptClass(this.server);
    this._scripts.push(script);

    const errors = script.getScriptState().errors;
    if (errors.length) {
      script.state = 'failed';
      console.error(`Failed to add script ${script.id}\n` + JSON.stringify(errors, null, 2));
    } else {
      script.state = 'starting';
    }
  }

  private async forRunningScripts(fn: (script: Script<any>) => Promise<any> | void) {
    for (const script of this._scripts) {
      if (script.state === 'running') await script.tryCatchFn(() => fn(script));
    }
  }
}
