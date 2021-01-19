import ClientModule from '../client-module';
import * as Helper from '../helper';

export interface Settings {
  showGrid: boolean;
  volume: number;
  lightMode: number;
}

type SettingKey = keyof Settings;

const Settings: Record<SettingKey, any> = {
  volume: {
    label: 'Volume',
    type: 'number',
    default: process.env.NODE_ENV === 'production' ? 0.6 : 0,
    min: 0,
    max: 1,
    step: 0.1,
  },
  showGrid: {
    label: 'Show Grid',
    type: 'boolean',
    default: true,
  },
  lightMode: {
    label: 'Light Mode',
    type: 'number',
    default: 3,
    min: 0,
    max: 3,
    step: 1,
  },
};

export function getDefaultSettings() {
  // @ts-ignore
  const settings: Settings = {};

  for (const [id, options] of Object.entries(Settings)) {
    // @ts-ignore
    settings[id] = options.default;
  }

  return settings;
}

class SettingsModule extends ClientModule {
  public onStart() {
    const panel = Helper.find('.panel--settings');
    const settingsEl = Helper.find('.settings', panel);

    settingsEl.addEventListener('change', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      const settingKey = e.target.attributes.getNamedItem('settingId')?.value as SettingKey;
      if (!(settingKey in this.game.client.settings)) return;

      const type = Settings[settingKey].type;
      if (type === 'number') {
        // @ts-ignore
        this.game.client.settings[settingKey] = e.target.valueAsNumber;
      } else if (type === 'boolean') {
        // @ts-ignore
        this.game.client.settings[settingKey] = e.target.checked;
      }

      // TODO: save and load settings.
    });

    for (const [id, options] of Object.entries(Settings)) {
      const settingEl = Helper.createChildOf(settingsEl, 'div');

      Helper.createChildOf(settingEl, 'label', '', {
        for: id,
      }).innerText = options.label;

      // @ts-ignore
      const value = id in this.game.client.settings ? this.game.client.settings[id] : options.default;

      if (options.type === 'boolean') {
        const attrs: any = {};
        if (options.default) attrs.checked = '';
        Helper.createChildOf(settingEl, 'input', '', {
          settingId: id,
          type: 'checkbox',
          ...attrs,
        }).innerText = options.label;
      } else if (options.type === 'number') {
        Helper.createChildOf(settingEl, 'input', '', {
          settingId: id,
          type: 'range',
          value: String(value),
          min: String(options.min),
          max: String(options.max),
          step: String(options.step),
        }).innerText = options.label;
      }
    }
  }
}

export default SettingsModule;
