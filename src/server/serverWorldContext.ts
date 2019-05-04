import * as fsSync from 'fs';
import * as path from 'path';
import { WorldContext } from '../context';
import * as fs from '../iso-fs';

export class ServerWorldContext extends WorldContext {
  public static async load(worldPath: string) {
    const meta = JSON.parse(await fs.readFile(path.join(worldPath, 'meta.json'), 'utf-8'));
    const world = new ServerWorldContext(meta.width, meta.height, meta.depth);
    world.worldPath = worldPath;
    return world;
  }

  public worldPath: string;

  public load(sectorPoint: TilePoint): Sector {
    const sectorPath = path.join(this.worldPath, `${sectorPoint.x},${sectorPoint.y},${sectorPoint.z}.json`);
    const data = JSON.parse(fsSync.readFileSync(sectorPath, 'utf-8'));
    return data;
  }

  public async save(sectorPoint: TilePoint) {
    const sector = this.getSector(sectorPoint);
    const sectorPath = path.join(this.worldPath, `${sectorPoint.x},${sectorPoint.y},${sectorPoint.z}.json`);
    const data = JSON.stringify(sector, null, 2);
    await fs.writeFile(sectorPath, data);
  }

  public async saveAll() {
    for (let sx = 0; sx < this.sectors.length; sx++) {
      for (let sy = 0; sy < this.sectors[0].length; sy++) {
        for (let sz = 0; sz < this.sectors[0][0].length; sz++) {
          await this.save({x: sx, y: sy, z: sz});
        }
      }
    }

    const meta = {
      width: this.width,
      height: this.height,
      depth: this.depth,
    };
    await fs.writeFile(path.join(this.worldPath, 'meta.json'), JSON.stringify(meta, null, 2));
  }
}
