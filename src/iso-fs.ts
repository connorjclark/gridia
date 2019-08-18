import * as fs from 'fs';
import { IDBPDatabase, openDB } from 'idb';

const isNode = typeof process !== 'undefined' && typeof process.release !== 'undefined';

function nodeExists(path: string): Promise<boolean> {
  return new Promise((resolve) => fs.exists(path, resolve));
}

function nodeWriteFile(path: string, data: string) {
  return fs.promises.writeFile(path, data);
}

function nodeReadFile(path: string) {
  return fs.promises.readFile(path, 'utf-8');
}

const dbName = 'gridia';
const defaultStore = 'local-world';
let dbPromise: Promise<IDBPDatabase>;
function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(dbName, 1, {
      upgrade(db) {
        db.createObjectStore(defaultStore);
      },
    });
  }
  return dbPromise;
}

async function workerExists(path: string): Promise<boolean> {
  const db = await getDb();
  return typeof await db.get(defaultStore, path) !== 'undefined';
}

async function workerWriteFile(path: string, data: string) {
  const db = await getDb();
  await db.put(defaultStore, data, path);
}

async function workerReadFile(path: string) {
  const db = await getDb();
  return db.get(defaultStore, path);
}

async function workerReadDir(path: string) {
  if (!path.endsWith('/')) path += '/';

  const db = await getDb();
  // This is pretty hacky.
  const keysInAlphaRange = (await db.getAllKeys(defaultStore, IDBKeyRange.bound(path, `${path}zzz`)))
    .map((k) => k.toString());
  return keysInAlphaRange.filter((key) => {
    if (key === path) return false;

    const nextSep = key.indexOf('/', path.length);
    if (nextSep === -1 || nextSep === path.length - 1) return true;
    return false;
  }).map((key) => key.replace(new RegExp('^' + path), ''));
}

export const exists = isNode ? nodeExists : workerExists;
export const writeFile = isNode ? nodeWriteFile : workerWriteFile;
export const readFile = isNode ? nodeReadFile : workerReadFile;
export const mkdir = isNode ? fs.promises.mkdir : (path: string) => workerWriteFile(path, '');
export const readdir = isNode ? fs.promises.readdir : workerReadDir;
