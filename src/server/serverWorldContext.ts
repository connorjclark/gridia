import * as fsSync from 'fs';
import * as path from 'path';
import Container from '../container';
import { WorldContext } from '../context';
import * as fs from '../iso-fs';

export class ServerWorldContext extends WorldContext {
  public static async load(worldDir: string) {
    const meta = JSON.parse(await fs.readFile(path.join(worldDir, 'meta.json'), 'utf-8'));
    const world = new ServerWorldContext(meta.width, meta.height, meta.depth);
    world.worldDir = worldDir;
    world.sectorDir = path.join(worldDir, 'sectors');
    world.containerDir = path.join(worldDir, 'containers');
    // TODO when to load containers? all at once here, or lazily as needed like sectors?
    return world;
  }

  public worldDir: string;
  public sectorDir: string;
  public containerDir: string;

  public load(sectorPoint: TilePoint): Sector {
    return JSON.parse(fsSync.readFileSync(this.sectorPath(sectorPoint), 'utf-8'));
  }

  public async save(sectorPoint: TilePoint) {
    const sector = this.getSector(sectorPoint);
    const data = JSON.stringify(sector, null, 2);
    await fs.writeFile(this.sectorPath(sectorPoint), data);
  }

  public async saveAll() {
    await fs.mkdir(this.sectorDir, {recursive: true});
    await fs.mkdir(this.containerDir, {recursive: true});

    const meta = {
      width: this.width,
      height: this.height,
      depth: this.depth,
    };
    await fs.writeFile(this.metaPath(), JSON.stringify(meta, null, 2));

    for (let sx = 0; sx < this.sectors.length; sx++) {
      for (let sy = 0; sy < this.sectors[0].length; sy++) {
        for (let sz = 0; sz < this.sectors[0][0].length; sz++) {
          await this.save({x: sx, y: sy, z: sz});
        }
      }
    }

    for (const container of this.containers.values()) {
      const data = JSON.stringify(container.items, null, 2);
      await fs.writeFile(this.containerPath(container), data);
    }
  }

  protected metaPath() {
    return path.join(this.worldDir, 'meta.json');
  }

  protected sectorPath(sectorPoint: TilePoint) {
    return path.join(this.sectorDir, `${sectorPoint.x},${sectorPoint.y},${sectorPoint.z}.json`);
  }

  protected containerPath(container: Container) {
    return path.join(this.containerDir, `${container.id}.json`);
  }
}
