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
const defaultStoreName = 'defaultStore';
let db_: IDBPDatabase;
async function getDb() {
  if (!db_) {
    db_ = await openDB(dbName, 1, {
      upgrade(db) {
        db.createObjectStore(defaultStoreName);
      },
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

async function workerExists(path: string): Promise<boolean> {
  const db = await getDb();
  const [storeName, query] = parseDatabasePath(path);
  return typeof await db.get(storeName, query) !== 'undefined';
}

async function workerWriteFile(path: string, data: string) {
  const db = await getDb();
  const [storeName, query] = parseDatabasePath(path);
  await db.put(storeName, data, query);
}

async function workerReadFile(path: string): Promise<string> {
  const db = await getDb();
  const [storeName, query] = parseDatabasePath(path);
  return db.get(storeName, query);
}

async function workerReadDir(path: string) {
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

export const exists = isNode ? nodeExists : workerExists;
export const writeFile = isNode ? nodeWriteFile : workerWriteFile;
export const readFile = isNode ? nodeReadFile : workerReadFile;
export const mkdir = isNode ? fs.promises.mkdir : (path: string, opts?: any) => workerWriteFile(path, '');
export const readdir = isNode ? fs.promises.readdir : workerReadDir;
