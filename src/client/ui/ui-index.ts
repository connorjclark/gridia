import { GFX_SIZE } from '../../constants';
import * as Content from '../../content';
import { deserialize } from '../../lib/wire-serializer';
import * as Utils from '../../utils';
import TypedEventEmitter from '../event-emitter';
import * as Helper from '../helper';
import AdminModule from '../modules/admin-module';
import MapModule from '../modules/map-module';
import MovementModule from '../modules/movement-module';
import SelectedViewModule from '../modules/selected-view-module';
import SettingsModule, { getDefaultSettings } from '../modules/settings-module';
import SkillsModule from '../modules/skills-module';
import SoundModule from '../modules/sound-module';
import UsageModule from '../modules/usage-module';

import { makeContainerWindow } from './container-window';
import { makeHelpWindow } from './help-window';
import { makePossibleUsagesWindow } from './possible-usages-window';
import { makeSettingsWindow } from './settings-window';

// super hacky file to render UI, copies / fakes a bunch of stuff from game.ts

document.addEventListener('DOMContentLoaded', async () => {
  await Content.loadContentFromNetwork();

  class FakeGame {
    client = {
      eventEmitter: new TypedEventEmitter(),
      settings: {},
      // eslint-disable-next-line max-len
      player: deserialize('{"id":"b31f3f4d-859b-41d8-b218-d262ca0f9358","name":"Quick Jill 161","attributes":{"$m":[["dexterity",{"baseLevel":100,"earnedLevel":0}],["intelligence",{"baseLevel":200,"earnedLevel":0}],["life",{"baseLevel":200,"earnedLevel":0}],["mana",{"baseLevel":100,"earnedLevel":0}],["quickness",{"baseLevel":100,"earnedLevel":0}],["stamina",{"baseLevel":100,"earnedLevel":0}],["strength",{"baseLevel":100,"earnedLevel":0}],["wisdom",{"baseLevel":100,"earnedLevel":0}]]},"skills":{"$m":[[1,{"xp":1230}],[25,{"xp":33310}]]},"skillPoints":38,"questStates":{"$m":[]},"tilesSeenLog":{"$m":[]},"isAdmin":true,"containerId":"113cc044-544b-4f1c-a15a-02a4a2d4b651","equipmentContainerId":"1bd2bd07-d270-439d-b780-79e0dc1cef88","loc":{"w":0,"x":50,"y":53,"z":0},"life":200,"stamina":100,"mana":100,"buffs":[{"expiresAt":1620023415194,"skill":1,"percentChange":0.1,"linearChange":10},{"expiresAt":1620023415194,"skill":4,"percentChange":0.2,"linearChange":25}]}'),
      creature: { buffs: [] },
    };
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
    loader = {
      loadAllImageResources() {
        // ...
      },
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
    const { el, actions } = makePossibleUsagesWindow({ game });
    actions.setPossibleUsages([
      {
        toolIndex: 0,
        usageIndex: 0,
        use: Content.getAllItemUses()[231],
        focusLocation: { source: 'world', loc: { w: 0, x: 0, y: 0, z: 0 } },
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
    const { el, actions } = makeContainerWindow(game, container);
  }

  const scale = 1.5;
  const gridCursorEl = document.querySelector('.grid-cursor') as HTMLElement;
  function mouseToWorld(pm: ScreenPoint): ScreenPoint {
    return { x: pm.x / scale, y: pm.y / scale };
  }
  function worldToTile(pw: ScreenPoint) {
    return Utils.worldToTile(0, pw, 0);
  }

  // copied from game.ts
  // TODO: get new Game() to work in this fake ui page too.
  document.addEventListener('pointermove', (e) => {
    const loc = worldToTile(mouseToWorld({ x: e.clientX, y: e.clientY }));
    const mouse = {
      // ...this.state.mouse,
      x: e.clientX,
      y: e.clientY,
      tile: loc,
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

  // TODO: also copied
  let currentPanel = '';
  function registerPanelListeners() {
    Helper.find('.panels__tabs').addEventListener('click', (e) => {
      Helper.maybeFind('.panels__tab--active')?.classList.toggle('panels__tab--active');

      const targetEl = e.target as HTMLElement;
      let panelName = targetEl.dataset.panel as string;
      if (panelName === currentPanel) panelName = '';

      game.client.eventEmitter.emit('panelFocusChanged', { panelName });
      currentPanel = panelName;
      if (!panelName) return;

      targetEl.classList.toggle('panels__tab--active');
    });
  }
  registerPanelListeners();

  let helpWindow: ReturnType<typeof makeHelpWindow>;
  // @ts-expect-error
  game.client.eventEmitter.on('panelFocusChanged', ({ panelName }) => {
    if (panelName === 'help') {
      if (!helpWindow) helpWindow = makeHelpWindow(game);
      helpWindow.el.hidden = false;
    } else if (helpWindow) {
      helpWindow.el.hidden = true;
    }
  });
});
