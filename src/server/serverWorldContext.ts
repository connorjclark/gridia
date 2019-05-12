import * as fsSync from 'fs';
import * as path from 'path';
import Container from '../container';
import { Context } from '../context';
import * as fs from '../iso-fs';
import WorldMap from '../world-map';

export class ServerContext extends Context {
  public static async load(serverDir: string) {
    const meta = JSON.parse(await fs.readFile(path.join(serverDir, 'meta.json'), 'utf-8'));
    const map = new WorldMap(meta.width, meta.height, meta.depth);
    map.loader = (sectorPoint) => {
      return context.loadSector(sectorPoint);
    };
    const context = new ServerContext(map);
    context.setServerDir(serverDir);
    // TODO when to load containers? all at once here, or lazily as needed like sectors?
    return context;
  }

  public serverDir: string;
  public sectorDir: string;
  public containerDir: string;

  public setServerDir(serverDir: string) {
    this.serverDir = serverDir;
    this.sectorDir = path.join(serverDir, 'sectors');
    this.containerDir = path.join(serverDir, 'containers');
  }

  public loadSector(sectorPoint: TilePoint): Sector {
    return JSON.parse(fsSync.readFileSync(this.sectorPath(sectorPoint), 'utf-8'));
  }

  public async saveSector(sectorPoint: TilePoint) {
    const sector = this.map.getSector(sectorPoint);
    const data = JSON.stringify(sector, null, 2);
    await fs.writeFile(this.sectorPath(sectorPoint), data);
  }

  public async save() {
    await fs.mkdir(this.sectorDir, {recursive: true});
    await fs.mkdir(this.containerDir, {recursive: true});

    const meta = {
      width: this.map.width,
      height: this.map.height,
      depth: this.map.depth,
    };
    await fs.writeFile(this.metaPath(), JSON.stringify(meta, null, 2));

    for (let sx = 0; sx < this.map.sectors.length; sx++) {
      for (let sy = 0; sy < this.map.sectors[0].length; sy++) {
        for (let sz = 0; sz < this.map.sectors[0][0].length; sz++) {
          await this.saveSector({x: sx, y: sy, z: sz});
        }
      }
    }

    for (const container of this.containers.values()) {
      const data = JSON.stringify(container.items, null, 2);
      await fs.writeFile(this.containerPath(container), data);
    }
  }

  protected metaPath() {
    return path.join(this.serverDir, 'meta.json');
  }

  protected sectorPath(sectorPoint: TilePoint) {
    return path.join(this.sectorDir, `${sectorPoint.x},${sectorPoint.y},${sectorPoint.z}.json`);
  }

  protected containerPath(container: Container) {
    return path.join(this.containerDir, `${container.id}.json`);
  }
}
