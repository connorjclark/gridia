import * as PIXI from 'pixi.js';

class LazyResourceLoader {
  private loadQueue: string[] = [];
  private loader = PIXI.Loader.shared;
  private isLoadingResourceKey = new Set<string>();
  private isResourceLoaded = new Set<string>();

  public hasResourceLoaded(key: string) {
    return this.isResourceLoaded.has(key);
    // The below doesn't work well - sometimes results in textures never showing. idk why
    // return loader.resources[key] && loader.resources[key].isComplete && loader.resources[key].texture;
  }

  public loadResource(key: string) {
    if (this.isLoadingResourceKey.has(key)) return;
    this.isLoadingResourceKey.add(key);
    this.loadQueue.push(key);
    setInterval(this.processLoadQueue.bind(this), 1);
  }

  private processLoadQueue() {
    if (!this.loadQueue.length) return;
    if (this.loader.loading) return;

    const queue = [...this.loadQueue];
    this.loadQueue.splice(0, this.loadQueue.length);

    this.loader.add(queue).load((_, resources) => {
      for (const resource of Object.values(resources)) {
        if (!resource) continue;
        this.isLoadingResourceKey.delete(resource.name);
        this.isResourceLoaded.add(resource.name);
      }
      this.processLoadQueue();
    });
  }
}

export default LazyResourceLoader;
