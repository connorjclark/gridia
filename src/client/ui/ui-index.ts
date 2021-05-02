import { GFX_SIZE } from '../../constants';
import * as Content from '../../content';
import * as Utils from '../../utils';
import { getDefaultSettings } from '../modules/settings-module';
import { makeContainerWindow } from './container-window';
import { makePossibleUsagesWindow } from './possible-usages-window';
import { makeSettingsWindow } from './settings-window';
import { makeSkillsWindow } from './skills-window';

document.addEventListener('DOMContentLoaded', async () => {
  await Content.loadContentFromNetwork();

  // @ts-expect-error
  const game: Game = undefined;

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

  {
    const { el, actions } = makeSettingsWindow({ settings: getDefaultSettings() });
  }

  {
    const { el, actions } = makeSkillsWindow({
      combatLevel: {
        level: 50,
        xpBar: { current: 500000, max: 1000000 },
      },
      attributes: [
        {
          name: 'life',
          baseLevel: 92,
          earnedLevel: 20,
        },
        {
          name: 'mana',
          baseLevel: 76,
          earnedLevel: 4,
        },
        {
          name: 'stamina',
          baseLevel: 79,
          earnedLevel: 11,
        },
        {
          name: 'dexterity',
          baseLevel: 12,
          earnedLevel: 12,
        },
        {
          name: 'intelligence',
          baseLevel: 36,
          earnedLevel: 12,
        },
        {
          name: 'quickness',
          baseLevel: 33,
          earnedLevel: 11,
        },
        {
          name: 'strength',
          baseLevel: 39,
          earnedLevel: 15,
        },
        {
          name: 'wisdom',
          baseLevel: 89,
          earnedLevel: 15,
        },
      ],
      skills: [
        {
          id: 0,
          name: 'Farming',
          level: 1,
          baseLevel: 1,
          earnedLevel: 1,
          buffAmount: 0,
          xp: 100,
          xpBar: { current: 100, max: 200 },
          baseLevelFormula: '',
        },
        {
          id: 1,
          name: 'Fishing',
          level: 10,
          baseLevel: 1,
          earnedLevel: 1,
          buffAmount: 3,
          xp: 12300,
          xpBar: { current: 20, max: 200 },
          baseLevelFormula: '',
        },
      ],
    });
  }

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
});
