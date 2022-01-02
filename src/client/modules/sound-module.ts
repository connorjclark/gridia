import * as Utils from '../../utils.js';
import {ClientModule} from '../client-module.js';
import {getMusicResource, SfxResources} from '../lazy-resource-loader.js';

const SONGS = [
  'aaron-anderson-11/Good Memories.mp3',
  'boxcat/Against the Wall.mp3',
  'boxcat/Inspiration.mp3',
  'boxcat/Passing Time.mp3',
  'boxcat/Young Love.mp3',
  'scythuz/Mead in Jorvik.mp3',
  'scythuz/Spring Breeze.mp3',
  'scythuz/Withering Leaves.mp3',
];

export class SoundModule extends ClientModule {
  songMode: 'shuffle' | 'loop' = 'shuffle';
  private _shuffledSongList: string[] = [];
  private _soundCache: Record<string, PIXI.sound.Sound> = {};
  private _currentSongName?: string;
  private _currentSong?: PIXI.sound.IMediaInstance;
  private _state: 'not-initialized' | 'loading-song' | 'playing' = 'not-initialized';

  onStart() {
    // ...
  }

  async onTick() {
    if (this.game.client.settings.musicVolume === 0) {
      if (this._currentSong && !this._currentSong.paused) this._currentSong.paused = true;
      return;
    } else {
      if (!this._currentSong && this._currentSongName) {
        await this.playSong(this._currentSongName);
      }
      if (this._currentSong && this._currentSong.paused) {
        this._currentSong.paused = false;
      }
    }

    if (this._currentSong) {
      this._currentSong.volume = this.game.client.settings.musicVolume;
    }

    const songFinished = this._state === 'playing' && this._currentSong && this._currentSong.progress === 1;
    if (this.songMode === 'shuffle' && (this._state === 'not-initialized' || songFinished)) {
      await this._continueShuffledPlaylist();
    }
  }

  playSfx(name: string, pos?: Point4, globalVolume = 1) {
    if (this.game.client.settings.sfxVolume === 0) return;

    if (!this._soundCache[name]) {
      const resourceKey = SfxResources[name];
      this._soundCache[name] = PIXI.sound.Sound.from(resourceKey);
    }

    // TODO: stereo sound https://github.com/pixijs/pixi-sound/issues/73
    const getVolume = () => {
      let multiplier = 1;
      if (pos) {
        const range = 50;
        const x = Utils.dist(this.game.client.creature.pos, pos) / range;
        // https://www.desmos.com/calculator/mqvwdlklo7
        multiplier = Utils.clamp(1.1 - 3.6 * Math.log10(x + 1), 0, 1);
      }
      return multiplier * globalVolume * this.game.client.settings.sfxVolume;
    };

    const sound = this._soundCache[name];
    const handle = setInterval(() => {
      sound.volume = getVolume();
    }, 100);
    sound.volume = getVolume();
    void sound.play(() => clearInterval(handle));
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
      // this._currentSong.destroy();
    }

    this._state = 'loading-song';
    this._currentSong = await this._soundCache[name].play({
      volume: this.game.client.settings.musicVolume,
      loop: this.songMode === 'loop',
    });
    this._state = 'playing';
    this._currentSongName = name;
  }

  async skipSong() {
    if (this.songMode !== 'shuffle') return;
    await this._continueShuffledPlaylist();
  }

  async _continueShuffledPlaylist() {
    if (this._shuffledSongList.length === 0) {
      this._shuffledSongList = [...SONGS].sort(() => Math.random() > 0.5 ? 1 : -1);
    }

    const nextSong = this._shuffledSongList.pop();
    if (nextSong) {
      await this.playSong(nextSong);
    }
  }
}
