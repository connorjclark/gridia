import {GFX_SIZE} from '../../constants.js';
import * as Content from '../../content.js';
import {deserialize} from '../../lib/wire-serializer.js';
import * as Utils from '../../utils.js';
import {TypedEventEmitter} from '../event-emitter.js';
import * as Helper from '../helper.js';
import {AdminModule} from '../modules/admin-module.js';
import {MapModule} from '../modules/map-module.js';
import {MovementModule} from '../modules/movement-module.js';
import {SelectedViewModule} from '../modules/selected-view-module.js';
import {SettingsModule} from '../modules/settings-module.js';
import {SkillsModule} from '../modules/skills-module.js';
import {SoundModule} from '../modules/sound-module.js';
import {UsageModule} from '../modules/usage-module.js';

import {WindowManager} from './window-manager.js';
import {makeContainerWindow} from './windows/container-window.js';
import {makeHelpWindow} from './windows/help-window.js';
import {makePossibleUsagesWindow} from './windows/possible-usages-window.js';

// super hacky file to render UI, copies / fakes a bunch of stuff from game.ts

document.addEventListener('DOMContentLoaded', async () => {
  await Content.initializeWorldData({
    baseDir: 'worlds/rpgwo-world',
    tileSize: 32,
    // @ts-expect-error
    characterCreation: {},
  });

  class FakeGame {
    windowManager = new WindowManager();
    client = {
      eventEmitter: new TypedEventEmitter(),
      settings: {
        bindings: {},
      },
      // eslint-disable-next-line max-len
      player: deserialize('{"id":"b31f3f4d-859b-41d8-b218-d262ca0f9358","name":"Quick Jill 161","attributes":{"$m":[["dexterity",{"baseLevel":100,"earnedLevel":0}],["intelligence",{"baseLevel":200,"earnedLevel":0}],["life",{"baseLevel":200,"earnedLevel":0}],["mana",{"baseLevel":100,"earnedLevel":0}],["quickness",{"baseLevel":100,"earnedLevel":0}],["stamina",{"baseLevel":100,"earnedLevel":0}],["strength",{"baseLevel":100,"earnedLevel":0}],["wisdom",{"baseLevel":100,"earnedLevel":0}]]},"skills":{"$m":[[1,{"xp":1230}],[25,{"xp":33310}]]},"skillPoints":38,"questStates":{"$m":[]},"tilesSeenLog":{"$m":[]},"isAdmin":true,"containerId":"113cc044-544b-4f1c-a15a-02a4a2d4b651","equipmentContainerId":"1bd2bd07-d270-439d-b780-79e0dc1cef88","pos":{"w":0,"x":50,"y":53,"z":0},"life":200,"stamina":100,"mana":100,"buffs":[{"expiresAt":1620023415194,"skill":1,"percentChange":0.1,"linearChange":10},{"expiresAt":1620023415194,"skill":4,"percentChange":0.2,"linearChange":25}]}'),
      creature: {buffs: [], pos: {w: 0, x: 10, y: 10, z: 0}},
      getOrRequestPartition: () => ({partition: null, promise: new Promise(() => {
        // never
      })}),
      worldTime: 'time',
    };
    // @ts-expect-error
    modules = {
      // @ts-expect-error
      admin: new AdminModule(this),
      // @ts-expect-error
      movement: new MovementModule(this),
      // @ts-expect-error
      selectedView: new SelectedViewModule(this),
      // @ts-expect-error
      settings: new SettingsModule(this),
      // @ts-expect-error
      map: new MapModule(this),
      // @ts-expect-error
      skills: new SkillsModule(this),
      // @ts-expect-error
      sound: new SoundModule(this),
      // @ts-expect-error
      usage: new UsageModule(this),
    };

    possibleUsageCursor = {};
    registerCursor() {
      return {};
    }
    addActionCreator() {
      // ...
    }
  }
  // @ts-expect-error
  const game: Game = new FakeGame();
  for (const module of Object.values(game.modules)) {
    // @ts-expect-error
    module.onStart();
  }

  {
    // @ts-expect-error
    const {el, actions} = makePossibleUsagesWindow({game});
    actions.setPossibleUsages([
      {
        toolIndex: 0,
        usageIndex: 0,
        use: Content.getAllItemUses()[231],
        focusLocation: {source: 'world', pos: {w: 0, x: 0, y: 0, z: 0}},
      },
    ]);
  }

  // {
  //   const { el, actions } = makeSettingsWindow({ settings: getDefaultSettings() });
  // }

  // {
  //   const { el, actions } = makeSkillsWindow({
  //     combatLevel: {
  //       level: 50,
  //       xpBar: { current: 500000, max: 1000000 },
  //     },
  //     attributes: [
  //       {
  //         name: 'life',
  //         baseLevel: 92,
  //         earnedLevel: 20,
  //       },
  //       {
  //         name: 'mana',
  //         baseLevel: 76,
  //         earnedLevel: 4,
  //       },
  //       {
  //         name: 'stamina',
  //         baseLevel: 79,
  //         earnedLevel: 11,
  //       },
  //       {
  //         name: 'dexterity',
  //         baseLevel: 12,
  //         earnedLevel: 12,
  //       },
  //       {
  //         name: 'intelligence',
  //         baseLevel: 36,
  //         earnedLevel: 12,
  //       },
  //       {
  //         name: 'quickness',
  //         baseLevel: 33,
  //         earnedLevel: 11,
  //       },
  //       {
  //         name: 'strength',
  //         baseLevel: 39,
  //         earnedLevel: 15,
  //       },
  //       {
  //         name: 'wisdom',
  //         baseLevel: 89,
  //         earnedLevel: 15,
  //       },
  //     ],
  //     skills: [
  //       {
  //         id: 0,
  //         name: 'Farming',
  //         level: 1,
  //         baseLevel: 1,
  //         earnedLevel: 1,
  //         buffAmount: 0,
  //         xp: 100,
  //         xpBar: { current: 100, max: 200 },
  //         baseLevelFormula: '',
  //       },
  //       {
  //         id: 1,
  //         name: 'Fishing',
  //         level: 10,
  //         baseLevel: 1,
  //         earnedLevel: 1,
  //         buffAmount: 3,
  //         xp: 12300,
  //         xpBar: { current: 20, max: 200 },
  //         baseLevelFormula: '',
  //       },
  //     ],
  //   });
  // }

  {
    const container = {
      id: '1',
      type: 'normal' as const,
      items: [
        {
          type: 57,
          quantity: 1,
        },
        {
          type: 280,
          quantity: 1,
        },
        {
          type: 901,
          quantity: 1,
        },
        {
          type: 1067,
          quantity: 1,
        },
        {
          type: 1974,
          quantity: 100,
        },
        {
          type: 1783,
          quantity: 1,
        },
        {
          type: 1068,
          quantity: 1,
        },
        {
          type: 826,
          quantity: 1,
        },
        {
          type: 335,
          quantity: 1,
        },
        {
          type: 406,
          quantity: 100,
        },
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    };
    makeContainerWindow(game, container);
  }

  const scale = 1.5;
  const gridCursorEl = document.querySelector('.grid-cursor') as HTMLElement;
  function mouseToWorld(pm: ScreenPoint): ScreenPoint {
    return {x: pm.x / scale, y: pm.y / scale};
  }
  function worldToTile(pw: ScreenPoint) {
    return Utils.worldToTile(0, pw, 0);
  }

  // copied from game.ts
  // TODO: get new Game() to work in this fake ui page too.
  document.addEventListener('pointermove', (e) => {
    const pos = worldToTile(mouseToWorld({x: e.clientX, y: e.clientY}));
    const mouse = {
      // ...this.state.mouse,
      x: e.clientX,
      y: e.clientY,
      tile: pos,
    };

    if (!(e.target as HTMLElement).closest('.ui')) {
      const size = GFX_SIZE * scale;
      gridCursorEl.hidden = false;
      gridCursorEl.style.setProperty('--size', size + 'px');
      if (mouse.tile) {
        const x = (mouse.tile.x) * size;
        const y = (mouse.tile.y) * size;
        gridCursorEl.style.setProperty('--x', x + 'px');
        gridCursorEl.style.setProperty('--y', y + 'px');
      }
    } else {
      gridCursorEl.hidden = true;
    }
  });

  makeHelpWindow(game);

  // TODO: also copied
  Helper.find('.panels__tabs').addEventListener('click', (e) => {
    const targetEl = e.target as HTMLElement;
    const name = targetEl.dataset.panel as string;
    targetEl.classList.toggle('panels__tab--active');
    const active = targetEl.classList.contains('panels__tab--active');

    if (active) {
      game.windowManager.showWindow(name);
    } else {
      game.windowManager.hideWindow(name);
    }
  });
});
