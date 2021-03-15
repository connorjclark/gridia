import * as fs from 'fs';
import { IDBPDatabase, openDB } from 'idb';

const isNode = typeof process !== 'undefined' && typeof process.release !== 'undefined';

export let rootDirectoryPath_ = '';
let rootDirectoryHandle_: FileSystemDirectoryHandle;
let fsType: 'native' | 'fsapi' | 'idb';

interface InitializeOptions {
  type: typeof fsType;
  rootDirectoryPath: string;
  rootDirectoryHandle?: FileSystemDirectoryHandle;
}

export function setRootDirectoryPath(path: string) {
  if (fsType === 'native') throw new Error();
  rootDirectoryPath_ = path;
}

export async function initialize({ type, rootDirectoryPath, rootDirectoryHandle }: InitializeOptions) {
  rootDirectoryPath_ = rootDirectoryPath;

  if (isNode && type !== 'native') throw new Error('invalid type for node');

  if (type === 'native') {
    exists = nodeExists;
    writeFile = nodeWriteFile;
    readFile = nodeReadFile;
    mkdir = nodeMkDir;
    readdir = nodeReadDir;
  } else if (type === 'fsapi') {
    if (!rootDirectoryHandle) throw new Error('missing rootDirectoryHandle');
    rootDirectoryHandle_ = rootDirectoryHandle;

    exists = fsapiExists;
    writeFile = fsapiWriteFile;
    readFile = fsapiReadFile;
    mkdir = fsapiMkdir;
    readdir = fsapiReadDir;
  } else if (type === 'idb') {
    exists = idbExists;
    writeFile = idbWriteFile;
    readFile = idbReadFile;
    mkdir = (path: string, _opts?: any) => idbWriteFile(path, '');
    readdir = idbReadDir;

    if (!await getDb()) throw new Error('error creating indexeddb');
  }
}

function nodeExists(path: string): Promise<boolean> {
  path = `${rootDirectoryPath_}/${path}`;
  return new Promise((resolve) => fs.exists(path, resolve));
}

function nodeWriteFile(path: string, data: string) {
  path = `${rootDirectoryPath_}/${path}`;
  return fs.promises.writeFile(path, data);
}

function nodeReadFile(path: string) {
  path = `${rootDirectoryPath_}/${path}`;
  return fs.promises.readFile(path, 'utf-8');
}

function nodeMkDir(path: string, opts?: fs.MakeDirectoryOptions) {
  path = `${rootDirectoryPath_}/${path}`;
  return fs.promises.mkdir(path, opts);
}

function nodeReadDir(path: string) {
  path = `${rootDirectoryPath_}/${path}`;
  return fs.promises.readdir(path);
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

async function idbExists(path: string): Promise<boolean> {
  path = `${rootDirectoryPath_}/${path}`;
  const db = await getDb();
  const [storeName, query] = parseDatabasePath(path);
  return typeof await db.get(storeName, query) !== 'undefined';
}

async function idbWriteFile(path: string, data: string) {
  path = `${rootDirectoryPath_}/${path}`;
  const db = await getDb();
  const [storeName, query] = parseDatabasePath(path);
  await db.put(storeName, data, query);
}

async function idbReadFile(path: string): Promise<string> {
  path = `${rootDirectoryPath_}/${path}`;
  const db = await getDb();
  const [storeName, query] = parseDatabasePath(path);
  return db.get(storeName, query);
}

async function idbReadDir(path: string) {
  path = `${rootDirectoryPath_}/${path}`;
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

const cache = new Map<string, FileSystemDirectoryHandle>();
async function fsapiTraversePath(pathComponents: string[]) {
  const path = pathComponents.join('/');
  const cachedResult = cache.get(path);
  if (cachedResult) return cachedResult;

  let dir = rootDirectoryHandle_;
  for (const pathComponent of pathComponents) {
    if (!pathComponent) continue;

    try {
      dir = await dir.getDirectoryHandle(pathComponent);
    } catch (_) {
      return false;
    }
  }

  cache.set(path, dir);
  return dir;
}

async function fsapiExists(path: string) {
  path = `${rootDirectoryPath_}/${path}`;
  const pathComponents = path.split('/');
  const filename = pathComponents.pop();
  if (!filename) return false;

  const dir = await fsapiTraversePath(pathComponents);
  if (!dir) return false;

  const doesExist = dir.getFileHandle(filename)
    .then(() => true)
    .catch(() => false);
  return doesExist;
}

async function fsapiWriteFile(path: string, data: string) {
  path = `${rootDirectoryPath_}/${path}`;
  const pathComponents = path.split('/');
  const filename = pathComponents.pop();
  if (!filename) throw new Error('invalid path ' + path);

  const dir = await fsapiTraversePath(pathComponents);
  if (!dir) throw new Error('invalid path ' + path);

  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function fsapiReadFile(path: string) {
  path = `${rootDirectoryPath_}/${path}`;
  const pathComponents = path.split('/');
  const filename = pathComponents.pop();
  if (!filename) throw new Error('invalid path ' + path);

  const dir = await fsapiTraversePath(pathComponents);
  if (!dir) throw new Error('invalid path ' + path);

  const fileHandle = await dir.getFileHandle(filename);
  const file = await fileHandle.getFile();
  return file.text();
}

async function fsapiMkdir(path: string) {
  path = `${rootDirectoryPath_}/${path}`;
  const names = path.split('/');
  let dir = rootDirectoryHandle_;
  for (const name of names) {
    if (!name) continue;
    dir = await dir.getDirectoryHandle(name, { create: true });
  }
}

async function fsapiReadDir(path: string) {
  path = `${rootDirectoryPath_}/${path}`;
  const pathComponents = path.split('/');
  const dir = await fsapiTraversePath(pathComponents);
  if (!dir) throw new Error('invalid path ' + path);

  const entries = [];
  for await (const entry of dir.keys()) {
    if (entry.endsWith('.crswap')) continue;
    entries.push(entry);
  }

  return entries;
}

const notInitialized = () => {
  throw new Error();
};
export let exists: typeof nodeExists = notInitialized;
export let writeFile: typeof nodeWriteFile = notInitialized;
export let readFile: typeof nodeReadFile = notInitialized;
export let mkdir: typeof nodeMkDir = notInitialized;
export let readdir: typeof nodeReadDir = notInitialized;
