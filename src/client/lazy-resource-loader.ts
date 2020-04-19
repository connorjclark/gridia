export const ImageResources: Record<string, string[]> = {
  animations: [],
  creatures: [],
  floors: [],
  items: [],
  templates: [
    './world/templates/templates0.png',
  ],
};

for (let i = 0; i < 8; i++) {
  ImageResources.creatures.push(`./world/player/player${i}.png`);
}
for (let i = 0; i < 6; i++) {
  ImageResources.floors.push(`./world/floors/floors${i}.png`);
}
for (let i = 0; i < 27; i++) {
  ImageResources.items.push(`./world/items/items${i}.png`);
}
for (let i = 0; i < 2; i++) {
  ImageResources.animations.push(`./world/animations/animations${i}.png`);
}

export const SfxResources = {
  beep: './world/sound/sfx/rpgwo/beep.WAV',
  blowarrow: './world/sound/sfx/rpgwo/BlowArrow.WAV',
  bombtiq: './world/sound/sfx/rpgwo/bombtiq.wav',
  bubble: './world/sound/sfx/rpgwo/bubble.wav',
  burning: './world/sound/sfx/rpgwo/burning.wav',
  caneswish: './world/sound/sfx/rpgwo/CaneSwish.wav',
  carpentryhammer: './world/sound/sfx/rpgwo/CarpentryHammer.wav',
  criket: './world/sound/sfx/rpgwo/criket.wav',
  crossbow: './world/sound/sfx/rpgwo/Crossbow.wav',
  diescream: './world/sound/sfx/rpgwo/diescream.wav',
  digi_plink: './world/sound/sfx/rcptones/digi_plink.wav',
  door: './world/sound/sfx/rpgwo/door.wav',
  fishing: './world/sound/sfx/rpgwo/fishing.wav',
  harry: './world/sound/sfx/rpgwo/harry.wav',
  havenmayor: './world/sound/sfx/rpgwo/havenmayor.wav',
  heal: './world/sound/sfx/ff6/heal.wav',
  hiccup: './world/sound/sfx/rpgwo/hiccup.wav',
  ice: './world/sound/sfx/rpgwo/ice.WAV',
  pop_drip: './world/sound/sfx/rcptones/pop_drip.wav',
  punch: './world/sound/sfx/rpgwo/punch.wav',
  roll: './world/sound/sfx/zelda/roll.wav',
  saw: './world/sound/sfx/rpgwo/Saw.wav',
  shoveldig: './world/sound/sfx/rpgwo/ShovelDig.wav',
  smithinghammer: './world/sound/sfx/rpgwo/smithinghammer.wav',
  sparkly: './world/sound/sfx/rpgwo/sparkly.wav',
  warp: './world/sound/sfx/rpgwo/warp.wav',
  woodcutting: './world/sound/sfx/ryanconway/woodcutting.wav',
};

function createPromiseAndResolve() {
  let resolve: Function;
  const promise = new Promise<void>((r) => resolve = r);
  return {
    promise,
    // @ts-ignore
    resolve,
  };
}

class LazyResourceLoader {
  private loadQueue: string[] = [];
  private loadingResourcePromise = new Map<string, {promise: Promise<void>, resolve: Function}>();
  private isResourceLoaded = new Set<string>();

  public hasResourceLoaded(key: string) {
    return this.isResourceLoaded.has(key);
    // The below doesn't work well - sometimes results in textures never showing. idk why
    // return loader.resources[key] && loader.resources[key].isComplete && loader.resources[key].texture;
  }

  public loadResource(key: string) {
    let promiseAndResolve = this.loadingResourcePromise.get(key);
    if (promiseAndResolve) return promiseAndResolve.promise;

    promiseAndResolve = createPromiseAndResolve();
    this.loadingResourcePromise.set(key, promiseAndResolve);
    this.loadQueue.push(key);
    setInterval(this.processLoadQueue.bind(this), 1);
    return promiseAndResolve.promise;
  }

  private processLoadQueue() {
    if (!this.loadQueue.length) return;
    if (PIXI.Loader.shared.loading) return;

    const queue = [...this.loadQueue];
    this.loadQueue.splice(0, this.loadQueue.length);

    PIXI.Loader.shared.add(queue).load((_, resources) => {
      for (const resource of Object.values(resources)) {
        if (!resource) continue;

        const resolve = this.loadingResourcePromise.get(resource.name)?.resolve;
        if (resolve) {
          this.loadingResourcePromise.delete(resource.name);
          this.isResourceLoaded.add(resource.name);
          resolve();
        }
      }
      this.processLoadQueue();
    });
  }
}

export default LazyResourceLoader;
