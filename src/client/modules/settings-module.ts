import {ClientModule} from '../client-module.js';
import {KEYS} from '../keys.js';
import {makeSettingsWindow} from '../ui/settings-window.js';

const defaultBindings: Settings['bindings'] = {
  actionMenu: {mouse: 2},
  attack: {key: KEYS.R},
  moveTo: {mouse: 0, shift: true},
  pickup: {key: KEYS.SHIFT},
  targetNext: {key: KEYS.E},
  targetPrevious: {key: KEYS.Q},
  useHand: {key: KEYS.ALT},
  useTool: {key: KEYS.SPACE_BAR},
};

export const SettingsSchema = {
  sfxVolume: {
    type: 'number',
    label: 'SFX Volume',
    default: process.env.NODE_ENV === 'production' ? 0.2 : 0,
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
  bindings: {
    type: 'object',
    default: defaultBindings,
  },
} as const;

function getDefaultSettings() {
  // @ts-expect-error
  const settings: Settings = {};

  for (const [id, options] of Object.entries(SettingsSchema)) {
    // @ts-expect-error
    settings[id] = options.default;
  }

  return settings;
}

export function getSettings(savedSettings: Partial<Settings>): Settings {
  const settings = {...getDefaultSettings(), ...savedSettings};
  if (savedSettings.bindings) settings.bindings = {...settings.bindings, ...savedSettings.bindings};
  return settings;
}

export class SettingsModule extends ClientModule {
  private settingsWindow?: ReturnType<typeof makeSettingsWindow>;

  getSettingsWindow() {
    if (this.settingsWindow) return this.settingsWindow;
    this.settingsWindow = makeSettingsWindow(this.game, {settings: this.game.client.settings});
    this.settingsWindow.subscribe((state) => {
      if (state.settings) this.game.client.settings = state.settings;
    });
    return this.settingsWindow;
  }

  onStart() {
    this.getSettingsWindow();
  }
}
