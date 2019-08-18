import * as fs from 'fs';
import { IDBPDatabase, openDB } from 'idb';

const isNode = typeof process !== 'undefined' && typeof process.release !== 'undefined';

let dbPromise: Promise<IDBPDatabase>;
function getDb() {
  if (!dbPromise) { dbPromise = openDB('gridia', 1, {
    upgrade(db) {
      db.createObjectStore('keyval');
    },
  });
  }
  return dbPromise;
}

function nodeWriteFile(path: string, data: string) {
  return fs.promises.writeFile(path, data);
}

function nodeReadFile(path: string) {
  return fs.promises.readFile(path, 'utf-8');
}

async function workerWriteFile(path: string, data: string) {
  const db = await dbPromise;
  await db.put('keyval', data, path);
}

async function workerReadFile(path: string) {
  return (await dbPromise).get('keyval', path);
}

async function workerReadDir(path: string) {
  return (await dbPromise).getAll('keyval', IDBKeyRange.bound(path, `${path}/zzz`));
}

export const writeFile = isNode ? nodeWriteFile : workerWriteFile;
export const readFile = isNode ? nodeReadFile : workerReadFile;
export const mkdir = isNode ? fs.promises.mkdir : () => Promise.resolve();
export const readdir = isNode ? fs.promises.readdir : workerReadDir;
