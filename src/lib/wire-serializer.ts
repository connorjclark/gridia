/* eslint-disable no-bitwise */

import * as serialijse from 'serialijse';
import Player, { TilesSeenLog, SectorTileSeenLogData } from '../player';
import Container from '../container';

// Name is required because minimization can break things.
export function registerClass(klass: any, name: string, serializeFn?: Function, deserializeFn?: Function) {
  // The client is minified, so serialzied objects from a server running in a browser worker will be minified.
  // So don't use a name alias.
  // @ts-ignore
  serialijse.declarePersistable(klass, undefined, serializeFn, deserializeFn);
  // The node server is not minified, so serialized objects from the server will contain the full class name.
  // @ts-ignore
  serialijse.declarePersistable(klass, name, serializeFn, deserializeFn);

  // Pretty sure this is going to hurt me later.
}

export function serialize(object: any) {
  return serialijse.serialize(object);
}

export function deserialize<T>(json: string) {
  const result: T = serialijse.deserialize(json);
  return result;
}

function mapToData(context: any, map: Map<any, any>, rawData: any) {
  rawData.e = serialize([...map.entries()]);
}
function dataToMap(context: any, object_id: any, data: { e: string }) {
  const map = new Map();
  const entries: Array<[any, any]> = deserialize(data.e) || [];
  for (const [key, value] of entries) {
    map.set(key, value);
  }

  context.cache[object_id] = map;
  return map;
}
registerClass(Map, 'Map', mapToData, dataToMap);

registerClass(Player, 'Player');
registerClass(TilesSeenLog, 'TilesSeenLog');
registerClass(Container, 'Container');

// TODO: should look into saving this as binary on disk / blobs in indexdb
// and sending as ArrayBuffers over the protocol.
function sectorTileSeenLogDataToData(context: any, obj: SectorTileSeenLogData, rawData: any) {
  rawData.e = [];

  for (const row of obj.tiles) {
    const numbers = new Uint16Array(row.map((tile) => {
      if (!tile) return 0;

      const val = (tile.walkable ? 1 : 0) + (tile.floor << 1);
      return val;
    }));
    rawData.e.push(numbers);
  }

  rawData.e = serialize(rawData.e);
}
function dataToSectorTileSeenLogData(context: any, object_id: any, data: { e: string }) {
  const obj = new SectorTileSeenLogData();
  const data2: Uint16Array[] = deserialize(data.e);

  for (let i = 0; i < obj.tiles.length; i++) {
    for (let j = 0; j < obj.tiles[0].length; j++) {
      const num = data2[i][j];
      if (num === 0) continue;

      obj.tiles[i][j] = { floor: num >> 1, walkable: num % 2 === 1 };
    }
  }

  context.cache[object_id] = obj;
  return obj;
}
registerClass(SectorTileSeenLogData, 'SectorTileSeenLogData', sectorTileSeenLogDataToData, dataToSectorTileSeenLogData);
