import ClientModule from '../client-module';
import * as Helper from '../helper';

class SettingsClientModule extends ClientModule {
  public onStart() {
    const panel = Helper.find('.panel--settings');

    Helper.find('.settings', panel).addEventListener('change', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;

      this.client.settings[e.target.id] = e.target.valueAsNumber;
      // TODO: save and load settings.
    });

    const getInput = (id: string) => Helper.find('#' + id, panel) as HTMLInputElement;
    getInput('volume').value = String(this.client.settings.volume);
  }
}

export default SettingsClientModule;
