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

  tick() {
    return this.forRunningScripts(async (script) => {
      await script.tick();
      if (script.state === 'failed') {
        await script.onStop();
      }
    });
  }

  getScriptStates(): ScriptState[] {
    return this._scripts.map((s) => s.getScriptState());
  }

  async addScript(ScriptClass: new (...args: any) => Script<any>) {
    const script = new ScriptClass(this.server);
    this._scripts.push(script);
    script.state = 'starting';

    const errors = script.getScriptState().errors;
    if (errors.length) {
      script.state = 'failed';
      // TODO: these aren't showing in admin Scripts panel.
      // TODO: class.name does not survive minification
      console.error(`Failed to add script ${ScriptClass.name}\n` + JSON.stringify(errors, null, 2));
      return;
    }

    try {
      await script.onStart();
      script.state = 'running';
    } catch (e: any) {
      script.state = 'failed';
      console.error(`Failed to start script ${ScriptClass.name}`);
      console.error(e);
      script.addError(e);
    }
  }

  private async forRunningScripts(fn: (script: Script<any>) => Promise<any> | void) {
    for (const script of this._scripts) {
      if (script.state === 'running') await script.tryCatchFn(() => fn(script));
    }
  }
}
