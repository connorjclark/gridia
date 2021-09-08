import * as fs from 'fs';

import { IDBPDatabase, openDB } from 'idb';

export abstract class IsoFs {
  abstract exists(path: string): Promise<boolean>;
  abstract writeFile(path: string, data: string): Promise<void>;
  abstract readFile(path: string): Promise<string>;
  abstract mkdir(path: string, opts?: fs.MakeDirectoryOptions): Promise<void>;
  abstract readdir(path: string): Promise<string[]>;
}

export class NodeFs extends IsoFs {
  constructor(private rootDirectoryPath: string) {
    super();

    const isNode = typeof process !== 'undefined' && typeof process.release !== 'undefined';
    if (!isNode) throw new Error('not in node');
  }

  async exists(path: string) {
    path = `${this.rootDirectoryPath}/${path}`;
    try {
      await fs.promises.stat(path);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false;
      } else {
        throw err;
      }
    }
  }

  writeFile(path: string, data: string) {
    path = `${this.rootDirectoryPath}/${path}`;
    return fs.promises.writeFile(path, data);
  }

  readFile(path: string) {
    path = `${this.rootDirectoryPath}/${path}`;
    return fs.promises.readFile(path, 'utf-8');
  }

  mkdir(path: string, opts?: fs.MakeDirectoryOptions) {
    path = `${this.rootDirectoryPath}/${path}`;
    return fs.promises.mkdir(path, opts);
  }

  readdir(path: string) {
    path = `${this.rootDirectoryPath}/${path}`;
    return fs.promises.readdir(path);
  }
}

const dbName = 'gridia';
const defaultStoreName = 'defaultStore';
let db_: IDBPDatabase;
async function getDb() {
  if (!db_) {
    db_ = await openDB(dbName, 1, {
      upgrade(db) {
        db.createObjectStore(defaultStoreName);
      },
      blocked: console.error,
      blocking: console.error,
    });
  }

  return db_;
}

function parseDatabasePath(path: string) {
  if (path.startsWith('/')) path = path.substr(1);
  return [defaultStoreName, '/' + path];
  // const firstSep = path.indexOf('/');
  // if (firstSep === -1) return [path, '/'];
  // return [path.substr(0, firstSep), path.substr(firstSep)];
}

export class IdbFs extends IsoFs {
  constructor(private rootDirectoryPath: string) {
    super();
  }

  async exists(path: string) {
    path = `${this.rootDirectoryPath}/${path}`;
    const db = await getDb();
    const [storeName, query] = parseDatabasePath(path);
    return typeof await db.get(storeName, query) !== 'undefined';
  }

  async writeFile(path: string, data: string) {
    path = `${this.rootDirectoryPath}/${path}`;
    const db = await getDb();
    const [storeName, query] = parseDatabasePath(path);
    await db.put(storeName, data, query);
  }

  async readFile(path: string) {
    path = `${this.rootDirectoryPath}/${path}`;
    const db = await getDb();
    const [storeName, query] = parseDatabasePath(path);
    return db.get(storeName, query);
  }

  async mkdir(path: string, opts?: fs.MakeDirectoryOptions) {
    return this.writeFile(path, '');
  }

  async readdir(path: string) {
    path = `${this.rootDirectoryPath}/${path}`;
    if (!path.endsWith('/')) path += '/';

    const db = await getDb();
    const [storeName, query] = parseDatabasePath(path);
    if (!db.objectStoreNames.contains(storeName)) return [];

    // This is pretty hacky.
    const keysInAlphaRange = (await db.getAllKeys(storeName, IDBKeyRange.bound(query, `${query}zzz`)))
      .map((k) => k.toString());
    return keysInAlphaRange.filter((key) => {
      if (key === query) return false;

      const nextSep = key.indexOf('/', query.length);
      if (nextSep === -1 || nextSep === query.length - 1) return true;
      return false;
    }).map((key) => key.replace(new RegExp('^' + query), ''));
  }
}

export class FsApiFs extends IsoFs {
  private cache = new Map<string, FileSystemDirectoryHandle>();

  constructor(private rootDirectoryHandle: FileSystemDirectoryHandle) {
    super();
  }

  async exists(path: string) {
    const pathComponents = path.split('/');
    const filename = pathComponents.pop();
    if (!filename) return false;

    const dir = await this.traversePath(pathComponents);
    if (!dir) return false;

    const doesExist = dir.getFileHandle(filename)
      .then(() => true)
      .catch(() => false);
    return doesExist;
  }

  async writeFile(path: string, data: string) {
    const pathComponents = path.split('/');
    const filename = pathComponents.pop();
    if (!filename) throw new Error('invalid path ' + path);

    const dir = await this.traversePath(pathComponents);
    if (!dir) throw new Error('invalid path ' + path);

    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async readFile(path: string) {
    const pathComponents = path.split('/');
    const filename = pathComponents.pop();
    if (!filename) throw new Error('invalid path ' + path);

    const dir = await this.traversePath(pathComponents);
    if (!dir) throw new Error('invalid path ' + path);

    const fileHandle = await dir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return file.text();
  }

  async mkdir(path: string) {
    const names = path.split('/');
    let dir = this.rootDirectoryHandle;
    for (const name of names) {
      if (!name) continue;
      dir = await dir.getDirectoryHandle(name, { create: true });
    }
  }

  async readdir(path: string) {
    const pathComponents = path.split('/');
    const dir = await this.traversePath(pathComponents);
    if (!dir) throw new Error('invalid path ' + path);

    const entries = [];
    for await (const entry of dir.keys()) {
      if (entry.endsWith('.crswap')) continue;
      entries.push(entry);
    }

    return entries;
  }

  private async traversePath(pathComponents: string[]) {
    const path = pathComponents.join('/');
    const cachedResult = this.cache.get(path);
    if (cachedResult) return cachedResult;

    let dir = this.rootDirectoryHandle;
    for (const pathComponent of pathComponents) {
      if (!pathComponent) continue;

      try {
        dir = await dir.getDirectoryHandle(pathComponent);
      } catch (_) {
        return false;
      }
    }

    this.cache.set(path, dir);
    return dir;
  }
}
