/* eslint-disable no-bitwise */

import * as serialijse from 'serialijse';
import Player, { TilesSeenLog, SectorTileSeenLogData, PlayerAttributes, PlayerSkills } from '../player';

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
registerClass(PlayerAttributes, 'PlayerAttributes');
registerClass(PlayerSkills, 'PlayerSkills');
registerClass(TilesSeenLog, 'TilesSeenLog');

// TODO: should look into saving this as binary on disk / blobs in indexdb.
registerClass(SectorTileSeenLogData, 'SectorTileSeenLogData');
