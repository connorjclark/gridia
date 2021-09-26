import {ClientModule} from '../client-module';
import {makeSettingsWindow} from '../ui/settings-window';

export interface Settings {
  showGrid: boolean;
  sfxVolume: number;
  musicVolume: number;
  lightMode: number;
  clickMagic: boolean;
  labelBackground: boolean;
  scale: number;
  limitView: boolean;
}

export const SettingsSchema = {
  sfxVolume: {
    type: 'number',
    label: 'SFX Volume',
    default: process.env.NODE_ENV === 'production' ? 0.6 : 0,
    min: 0,
    max: 1,
    step: 0.01,
  },
  musicVolume: {
    type: 'number',
    label: 'Music Volume',
    default: process.env.NODE_ENV === 'production' ? 0.2 : 0.0,
    min: 0,
    max: 1,
    step: 0.01,
  },
  showGrid: {
    type: 'boolean',
    label: 'Show Grid',
    default: false,
  },
  clickMagic: {
    type: 'boolean',
    label: 'Click Magic',
    default: false,
  },
  labelBackground: {
    type: 'boolean',
    label: 'Label Background',
    default: false,
  },
  lightMode: {
    type: 'number',
    label: 'Light Mode',
    default: 1,
    min: 0,
    max: 3,
    step: 1,
  },
  scale: {
    type: 'number',
    label: 'Scale',
    default: 1.5,
    min: 1,
    max: 3,
    step: 0.25,
  },
  limitView: {
    type: 'boolean',
    label: 'Limit View',
    default: false,
  },
} as const;

export function getDefaultSettings() {
  // @ts-ignore
  const settings: Settings = {};

  for (const [id, options] of Object.entries(SettingsSchema)) {
    // @ts-ignore
    settings[id] = options.default;
  }

  return settings;
}

export class SettingsModule extends ClientModule {
  private settingsWindow?: ReturnType<typeof makeSettingsWindow>;

  getSettingsWindow() {
    if (this.settingsWindow) return this.settingsWindow;
    this.settingsWindow = makeSettingsWindow({settings: this.game.client.settings});
    this.settingsWindow.subscribe((state) => {
      if (state.settings) this.game.client.settings = state.settings;
    });
    return this.settingsWindow;
  }

  onStart() {
    this.game.client.eventEmitter.on('panelFocusChanged', ({panelName}) => {
      if (panelName === 'settings') {
        this.getSettingsWindow().el.hidden = false;
        this.getSettingsWindow().actions.setSettings({...this.game.client.settings});
      } else if (this.settingsWindow) {
        this.getSettingsWindow().el.hidden = true;
      }
    });
  }
}
