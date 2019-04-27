// TODO bro-fs

import * as fs from 'fs';

export const writeFile = fs.promises && fs.promises.writeFile;
export const readFile = fs.promises && fs.promises.readFile;
