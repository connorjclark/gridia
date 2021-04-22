import * as Content from '../../content';
import { getDefaultSettings } from '../modules/settings-module';
import Container, { ContainerType } from '../../container';
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
      skills: [
        {
          id: 0,
          name: 'Farming',
          level: 1,
          xp: 100,
          xpBar: { current: 100, max: 200 },
        },
        {
          id: 1,
          name: 'Fishing',
          level: 10,
          xp: 12300,
          xpBar: { current: 20, max: 200 },
        },
      ],
    });
  }

  {
    const container = new Container(ContainerType.Normal, '1', [
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
    ]);
    const { el, actions } = makeContainerWindow(game, container);
  }
});
