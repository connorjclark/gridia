import ClientModule from '../client-module';
import { makeSettingsWindow } from '../ui/settings-window';

export interface Settings {
  showGrid: boolean;
  volume: number;
  lightMode: number;
  clickMagic: boolean;
}

export const SettingsSchema = {
  volume: {
    type: 'number',
    label: 'Volume',
    default: process.env.NODE_ENV === 'production' ? 0.6 : 0,
    min: 0,
    max: 1,
    step: 0.01,
  },
  showGrid: {
    type: 'boolean',
    label: 'Show Grid',
    default: true,
  },
  clickMagic: {
    type: 'boolean',
    label: 'Click Magic',
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

class SettingsModule extends ClientModule {
  private settingsWindow?: ReturnType<typeof makeSettingsWindow>;

  getSettingsWindow() {
    if (this.settingsWindow) return this.settingsWindow;
    this.settingsWindow = makeSettingsWindow(this);
    return this.settingsWindow;
  }

  onStart() {
    this.game.client.eventEmitter.on('panelFocusChanged', ({ panelName }) => {
      if (panelName === 'settings') {
        this.getSettingsWindow().el.hidden = false;
        this.getSettingsWindow().setState({settings: this.game.client.settings});
      } else if (this.settingsWindow) {
        this.getSettingsWindow().el.hidden = true;
      }
    });
  }
}

export default SettingsModule;
