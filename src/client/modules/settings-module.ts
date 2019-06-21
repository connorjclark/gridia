import ClientModule from '../client-module';
import * as Helper from '../helper';

class SettingsClientModule extends ClientModule {
  public onStart() {
    Helper.find('.settings').addEventListener('change', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;

      this.client.settings[e.target.id] = e.target.valueAsNumber;
      // TODO: save and load settings.
    });

    const getInput = (id: string) => Helper.find('.settings #' + id) as HTMLInputElement;
    getInput('volume').value = String(this.client.settings.volume);
  }
}

export default SettingsClientModule;
