import level from 'level';

// TODO: should be able to store objects.
// TODO: 'get' should return undefined instead of throw an error.

// Key-value database with supports for ranged queries and atomic transactions.
// Keys are split up into multiple "stores".
export abstract class Database {
  protected _transaction: Array<{store: string; key: string; value: string}> = [];

  abstract exists(store: string, key: string): Promise<boolean>;
  abstract put(store: string, key: string, data: string): Promise<void>;
  abstract get(store: string, key: string): Promise<string>;
  abstract getAllKeysInStore(store: string): Promise<string[]>;
  addToTransaction(store: string, key: string, value: string) {
    this._transaction.push({store, key, value});
  }
  abstract endTransaction(): Promise<void>;
}

function check(store: string, key: string) {
  if (!/[a-zA-Z\d]*/.test(store)) throw new Error('invalid store: ' + store);
  if (!/[a-zA-Z\d]*/.test(key)) throw new Error('invalid key: ' + key);
}

// Main database, works in node and browser.
export class LevelDb extends Database {
  private db: level.LevelDB;

  constructor(dbLocation: string) {
    super();
    this.db = level(dbLocation);
  }

  async exists(store: string, key: string) {
    check(store, key);
    try {
      await this.db.get(`${store}:${key}`);
      return true;
    } catch {
      return false;
    }
  }

  async put(store: string, key: string, data: string) {
    await this.db.put(`${store}:${key}`, data);
  }

  async get(store: string, key: string) {
    const value = await this.db.get(`${store}:${key}`);
    if (typeof value !== 'string') throw new Error('huh?');
    return value;
  }

  async getAllKeysInStore(store: string) {
    check(store, '');
    const db = this.db;
    const prefix = `${store}:`;
    const keys: string[] = [];
    await new Promise((resolve, reject) => {
      db.createKeyStream({
        gte: prefix,
        lt: prefix.slice(0, -1) + String.fromCharCode(prefix.slice(-1).charCodeAt(0) + 1),
      })
        .on('data', function(key) {
          keys.push(key.replace(prefix, ''));
        })
        .on('error', reject)
        .on('end', resolve);
    });
    return keys;
  }

  async endTransaction() {
    await this.db.batch(this._transaction.map((e) => ({type: 'put', key: `${e.store}:${e.key}`, value: e.value})));
  }
}

// Saves data directly to filesystem. Doesn't support atomic transactions, so not safe for real usage.
export class NodeFsDb extends Database {
  // TODO: move to separate file?
  fs_ = import('fs');

  constructor(private rootDirectoryPath: string) {
    super();

    const isNode = typeof process !== 'undefined' && typeof process.release !== 'undefined';
    if (!isNode) throw new Error('not in node');
  }

  private async fs() {
    const fs = await this.fs_;
    return fs.promises;
  }

  async exists(store: string, key: string) {
    check(store, key);
    const path = `${this.rootDirectoryPath}/${store}/${key}`;
    try {
      const fs = await this.fs();
      await fs.stat(path);
      return true;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return false;
      } else {
        throw err;
      }
    }
  }

  async put(store: string, key: string, data: string) {
    check(store, key);
    const path = `${this.rootDirectoryPath}/${store}/${key}`;
    const pathSplit = path.split('/');
    pathSplit.pop();
    const dir = pathSplit.join('/');

    const fs = await this.fs();
    await fs.mkdir(dir, {recursive: true});
    return fs.writeFile(path, data);
  }

  async get(store: string, key: string) {
    check(store, key);
    const path = `${this.rootDirectoryPath}/${store}/${key}`;
    const fs = await this.fs();
    return fs.readFile(path, 'utf-8');
  }

  async getAllKeysInStore(store: string) {
    check(store, '');
    const path = `${this.rootDirectoryPath}/${store}`;
    const fs = await this.fs();
    return fs.readdir(path);
  }

  async endTransaction() {
    for (const {store, key, value} of this._transaction) {
      await this.put(store, key, value);
    }
  }
}

// TODO: currently not used. Probably not needed?
export class FsApiDb extends Database {
  private cache = new Map<string, FileSystemDirectoryHandle>();

  constructor(private rootDirectoryHandle: FileSystemDirectoryHandle) {
    super();
  }

  async exists(store: string, key: string) {
    const dir = await this.traversePath([store]);
    if (!dir) return false;

    const doesExist = dir.getFileHandle(key)
      .then(() => true)
      .catch(() => false);
    return doesExist;
  }

  async put(store: string, key: string, data: string) {
    let dir = await this.traversePath([store]);
    if (!dir) {
      await this.mkdir(store);
      dir = await this.traversePath([store]);
      if (!dir) throw new Error('could not make store: ' + store);
    }

    const fileHandle = await dir.getFileHandle(key, {create: true});
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async get(store: string, key: string) {
    const dir = await this.traversePath([store]);
    if (!dir) throw new Error('invalid store ' + store);

    const fileHandle = await dir.getFileHandle(key);
    const file = await fileHandle.getFile();
    return file.text();
  }

  async mkdir(store: string) {
    const names = [store];
    let dir = this.rootDirectoryHandle;
    for (const name of names) {
      if (!name) continue;
      dir = await dir.getDirectoryHandle(name, {create: true});
    }
  }

  async getAllKeysInStore(store: string) {
    const dir = await this.traversePath([store]);
    if (!dir) throw new Error('invalid store ' + store);

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

  async endTransaction() {
    for (const {store, key, value} of this._transaction) {
      await this.put(store, key, value);
    }
  }
}

// Only used for tests.
export class MemoryDb extends Database {
  private stores: { [store: string]:  Map<string, string> } = {};

  exists(store: string, key: string) {
    return Promise.resolve(this.stores[store] && this.stores[store].has(key));
  }

  put(store: string, key: string, data: string) {
    if (!this.stores[store]) {
      this.stores[store] = new Map();
    }

    this.stores[store].set(key, data);
    return Promise.resolve();
  }

  get(store: string, key: string) {
    if (!this.stores[store]) throw new Error('invalid store ' + store);
    const value = this.stores[store].get(key);
    if (value === undefined) throw new Error('bad key');
    return Promise.resolve(value);
  }

  getAllKeysInStore(store: string) {
    if (!this.stores[store]) throw new Error('invalid store ' + store);
    return Promise.resolve(Array.from(this.stores[store].keys()));
  }

  async endTransaction() {
    for (const {store, key, value} of this._transaction) {
      await this.put(store, key, value);
    }
  }
}
