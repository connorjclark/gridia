import Client from '../client';
import ClientModule from '../client-module';
import * as Helper from '../helper';

class SettingsModule extends ClientModule {
  public onStart() {
    const panel = Helper.find('.panel--settings');

    Helper.find('.settings', panel).addEventListener('change', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      const settingKey = e.target.id as keyof Client['settings'];
      if (!(settingKey in this.game.client.settings)) return;

      this.game.client.settings[settingKey] = e.target.valueAsNumber;
      // TODO: save and load settings.
    });

    const getInput = (id: string) => Helper.find('#' + id, panel) as HTMLInputElement;
    getInput('volume').value = String(this.game.client.settings.volume);
  }
}

export default SettingsModule;
