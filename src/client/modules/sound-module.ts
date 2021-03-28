import ClientModule from '../client-module';
import * as Utils from '../../utils';
import { getMusicResource, SfxResources } from '../lazy-resource-loader';

class SoundModule extends ClientModule {
  songMode: 'shuffle' | 'loop' = 'shuffle';
  private _soundCache: Record<string, PIXI.sound.Sound> = {};
  private _currentSongName?: string;
  private _currentSong?: PIXI.sound.IMediaInstance;

  onStart() {
    // ...
  }

  async onTick() {
    if (!this._currentSong && this._currentSongName && this.game.client.settings.musicVolume > 0) {
      await this.playSong(this._currentSongName);
    }

    if (this._currentSong) {
      this._currentSong.volume = this.game.client.settings.musicVolume;

      if (this.songMode === 'shuffle' && this._currentSong.progress === 1) {
        await this.playSong(this.getRandomSong());
      }
    }
  }

  playSfx(name: string, loc?: Point4) {
    if (this.game.client.settings.sfxVolume === 0) return;

    if (!this._soundCache[name]) {
      const resourceKey = SfxResources[name];
      this._soundCache[name] = PIXI.sound.Sound.from(resourceKey);
    }

    // TODO: stereo sound https://github.com/pixijs/pixi-sound/issues/73
    let multiplier = 1;
    if (loc) {
      const range = 50;
      const x = Utils.dist(this.game.client.creature.pos, loc) / range;
      // https://www.desmos.com/calculator/mqvwdlklo7
      multiplier = Utils.clamp(1.1 - 3.6 * Math.log10(x + 1), 0, 1);
    }

    const volume = multiplier * this.game.client.settings.sfxVolume;
    void this._soundCache[name].play({ volume });
  }

  async playSong(name: string) {
    if (this.game.client.settings.musicVolume === 0) {
      this._currentSongName = name;
      return;
    }

    if (!this._soundCache[name]) {
      const resourceKey = getMusicResource(name);
      this._soundCache[name] = PIXI.sound.Sound.from(resourceKey);
    }

    if (this._currentSong) {
      this._currentSong.stop();
      this._currentSong.destroy();
    }

    this._currentSong = await this._soundCache[name].play({ volume: this.game.client.settings.musicVolume });
    if (this.songMode === 'loop') this._currentSong.loop = true;
    this._currentSongName = name;
  }

  getRandomSong() {
    const songs = [
      'aaron-anderson-11/Good Memories.mp3',
      'boxcat/Against the Wall.mp3',
      'boxcat/Inspiration.mp3',
      'boxcat/Passing Time.mp3',
      'boxcat/Young Love.mp3',
      'scythuz/Mead in Jorvik.mp3',
      'scythuz/Spring Breeze.mp3',
      'scythuz/Withering Leaves.mp3',
    ];
    return songs[Utils.randInt(0, songs.length - 1)];
  }
}

export default SoundModule;
