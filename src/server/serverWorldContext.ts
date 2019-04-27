import { WorldContext } from '../context';
import * as fs from '../iso-fs';

export class ServerWorldContext extends WorldContext {
  public static async load() {
    const meta = JSON.parse(await fs.readFile(`serverdata/meta.json`, 'utf-8'));
    return new ServerWorldContext(meta.width, meta.height);
  }

  public load(point: Point): Sector {
    // TODO load from disk
    return this.createEmptySector();
    // return createSector(!this.fillWorldWithStuff);
  }

  public async save(sectorPoint: Point) {
    const sector = this.getSector(sectorPoint);
    const sectorPath = `serverdata/${sectorPoint.x},${sectorPoint.y}.json`;
    const data = JSON.stringify(sector, null, 2);
    await fs.writeFile(sectorPath, data);
  }

  public async saveAll() {
    for (let sx = 0; sx < this.sectors.length; sx++) {
      for (let sy = 0; sy < this.sectors[0].length; sy++) {
        await this.save({x: sx, y: sy});
      }
    }

    const meta = {
      width: this.width,
      height: this.height,
    };
    await fs.writeFile(`serverdata/meta.json`, JSON.stringify(meta, null, 2));
  }
}
