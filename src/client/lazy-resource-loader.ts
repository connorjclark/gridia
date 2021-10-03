// TODO: sounds per-world.
export const SfxResources: Record<string, string> = {
  beep: './worlds/rpgwo-world/sound/sfx/rpgwo/beep.WAV',
  blowarrow: './worlds/rpgwo-world/sound/sfx/rpgwo/BlowArrow.WAV',
  bombtiq: './worlds/rpgwo-world/sound/sfx/rpgwo/bombtiq.wav',
  bubble: './worlds/rpgwo-world/sound/sfx/rpgwo/bubble.wav',
  burning: './worlds/rpgwo-world/sound/sfx/rpgwo/burning.wav',
  caneswish: './worlds/rpgwo-world/sound/sfx/rpgwo/CaneSwish.wav',
  carpentryhammer: './worlds/rpgwo-world/sound/sfx/rpgwo/CarpentryHammer.wav',
  criket: './worlds/rpgwo-world/sound/sfx/rpgwo/criket.wav',
  crossbow: './worlds/rpgwo-world/sound/sfx/rpgwo/Crossbow.wav',
  diescream: './worlds/rpgwo-world/sound/sfx/rpgwo/diescream.wav',
  digi_plink: './worlds/rpgwo-world/sound/sfx/rcptones/digi_plink.wav',
  door: './worlds/rpgwo-world/sound/sfx/rpgwo/door.wav',
  fishing: './worlds/rpgwo-world/sound/sfx/rpgwo/fishing.wav',
  harry: './worlds/rpgwo-world/sound/sfx/rpgwo/harry.wav',
  havenmayor: './worlds/rpgwo-world/sound/sfx/rpgwo/havenmayor.wav',
  heal: './worlds/rpgwo-world/sound/sfx/ff6/heal.wav',
  magic: './worlds/rpgwo-world/sound/sfx/paid/magic.wav',
  move: './worlds/rpgwo-world/sound/sfx/paid/move.wav',
  hiccup: './worlds/rpgwo-world/sound/sfx/rpgwo/hiccup.wav',
  ice: './worlds/rpgwo-world/sound/sfx/rpgwo/ice.WAV',
  pop_drip: './worlds/rpgwo-world/sound/sfx/rcptones/pop_drip.wav',
  punch: './worlds/rpgwo-world/sound/sfx/rpgwo/punch.wav',
  roll: './worlds/rpgwo-world/sound/sfx/zelda/roll.wav',
  saw: './worlds/rpgwo-world/sound/sfx/rpgwo/Saw.wav',
  shoveldig: './worlds/rpgwo-world/sound/sfx/rpgwo/ShovelDig.wav',
  smithinghammer: './worlds/rpgwo-world/sound/sfx/rpgwo/smithinghammer.wav',
  sparkly: './worlds/rpgwo-world/sound/sfx/rpgwo/sparkly.wav',
  warp: './worlds/rpgwo-world/sound/sfx/rpgwo/warp.wav',
  woodcutting: './worlds/rpgwo-world/sound/sfx/ryanconway/woodcutting.wav',
};

export function getMusicResource(name: string) {
  return `./worlds/rpgwo-world/sound/music/${name}`;
}

function createPromiseAndResolve() {
  let resolve: Function;
  const promise = new Promise<void>((r) => resolve = r);
  return {
    promise,
    // @ts-expect-error
    resolve,
  };
}

export class LazyResourceLoader {
  private loadQueue: string[] = [];
  private loadingResourcePromise = new Map<string, { promise: Promise<void>; resolve: Function }>();
  private isResourceLoaded = new Set<string>();

  hasResourceLoaded(key: string) {
    return this.isResourceLoaded.has(key);
    // The below doesn't work well - sometimes results in textures never showing. idk why
    // return loader.resources[key] && loader.resources[key].isComplete && loader.resources[key].texture;
  }

  loadResource(key: string) {
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

    PIXI.Loader.shared.add(queue).load((_, resources: PIXI.ILoaderResource[]) => {
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
