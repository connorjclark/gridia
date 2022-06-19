const sniffed = Symbol();

function assert(val: any) {
  if (!val) throw new Error('assertion failed');
}

export interface SniffedOperation {
  path: string;
  value?: any;
  splice?: {start: number; deleteCount: number; items: any[]};
  deleteIndices?: number[];
  add?: string | number;
  delete?: string | number;
  clear?: boolean;
}

interface DeferredState {
  target: any;
  originalPath: string;
  ops: SniffedOperation[];
  parentState?: DeferredState;
}

const proxyToOriginalObject = new WeakMap();
function unwrap(proxy: any) {
  if (typeof proxy !== 'object' || proxy === null) return proxy;

  const originalObject = proxyToOriginalObject.get(proxy) ?? proxy;
  for (const [key, value] of Object.entries(originalObject)) {
    originalObject[key] = unwrap(value);
  }

  return originalObject;
}

const deferredStates = new WeakMap<any, DeferredState>();
const originalObjectToDeferredProxy = new WeakMap<any, any>();

function handleDeferredState(proxy: any, cb: any) {
  const deferredState = deferredStates.get(proxy);
  if (!deferredState) return;

  const states = [];
  let cur: DeferredState | undefined = deferredState;
  do {
    states.push(cur);
    cur = cur.parentState;
  } while (cur);

  for (let i = states.length - 1; i >= 0; i--) {
    states[i].ops.forEach(cb);
  }
}

export function sniffObject<T extends object>(object: T, cb: (op: SniffedOperation) => void, prefix = '') {
  const proxy: T = new Proxy(object, {
    set(target, prop, value, reciever) {
      // @ts-expect-error ignore symbols.
      const path = `${prefix}.${prop}`;

      // Check for deferred state. See .filter in `get`.
      const deferredState = deferredStates.get(value);

      if (deferredState && deferredState.originalPath === path) {
        handleDeferredState(value, cb);
        value = unwrap(value);
        return Reflect.set(target, prop, value, reciever);
      }

      value = unwrap(value);

      if (!(Array.isArray(target) && prop === 'length')) {
        if (value !== Reflect.get(target, prop, reciever)) {
          cb({path, value});
        }
      }

      return Reflect.set(target, prop, value, reciever);
    },
    get(target, prop, reciever) {
      if (prop === sniffed) return true;

      if (prop === 'splice') {
        const origMethod = Reflect.get(target, prop, reciever);

        return (...args: any[]) => {
          const [start, deleteCount, ...items] = args;
          cb({path: prefix, splice: {start, deleteCount, items}});
          origMethod.apply(target, args);
        };
      } else if (prop === 'filter') {
        const origMethod = Reflect.get(target, prop, reciever);

        return (predicate: any) => {
          const deleteIndices: number[] = [];
          const newPredicate = (value: any, i: number, array: any[]) => {
            const result = predicate(value, i, array);
            if (!result) deleteIndices.push(i);
            return result;
          };
          const filtered = origMethod.apply(target, [newPredicate]);

          // .filter does not mutate the original array, so we can't issue a modification
          // callback until we know for sure it will be "written back" to the same property.
          // So stash the deleted indices and look for them later in `set`.
          // Also, further operations might happen to the intermediate array returned by .filter,
          // so record those operations too.

          const deferredSnifferState = {
            target,
            originalPath: prefix,
            ops: [
              {path: prefix, deleteIndices},
            ] as SniffedOperation[],
            parentState: deferredStates.get(originalObjectToDeferredProxy.get(object)),
          };
          const deferredSniffer = sniffObject(filtered, (op: SniffedOperation) => {
            deferredSnifferState.ops.push(op);
          }, prefix);
          deferredStates.set(deferredSniffer, deferredSnifferState);
          originalObjectToDeferredProxy.set(filtered, deferredSniffer);

          return deferredSniffer;
        };
      }

      const targetValue = Reflect.get(target, prop, reciever);
      const isMap = target.constructor === Map;
      const isSet = target.constructor === Set;
      if ((isMap || isSet) && typeof targetValue === 'function') {
        const targetMethod = targetValue.bind(target);
        if (isMap && prop === 'set') {
          const origTargetMethod = targetMethod;
          return (k: string | number, v: string) => {
            if (typeof k === 'object') throw new Error('Map keys must be string or number');
            origTargetMethod(k, v);
            cb({path: `${prefix}.${k}`, value: v});
          };
        } else if (isSet && prop === 'add') {
          const origTargetMethod = targetMethod;
          return (v: string | number) => {
            if (typeof v === 'object') throw new Error('Sets can only contain strings or numbers');
            origTargetMethod(v);
            cb({path: prefix, add: v});
          };
        } else if (prop === 'delete') {
          const origTargetMethod = targetMethod;
          return (k: string | number, v: string) => {
            origTargetMethod(k, v);
            cb({path: prefix, delete: k});
          };
        } else if (isMap && prop === 'get') {
          const origTargetMethod = targetMethod;
          return (k: string | number) => {
            const retValue = origTargetMethod(k);
            if (typeof retValue === 'object' && retValue !== null) {
              return sniffObject(retValue, cb, `${prefix}.${k}`);
            } else {
              return retValue;
            }
          };
        } else if (prop === 'clear') {
          const origTargetMethod = targetMethod;
          return () => {
            origTargetMethod();
            cb({path: prefix, clear: true});
          };
        } else {
          return targetMethod;
        }
      }

      if (typeof targetValue === 'object' && targetValue !== null) {
        // @ts-expect-error does not support symbols.
        const path = `${prefix}.${prop}`;
        return sniffObject(targetValue, cb, path);
      }

      return targetValue;
    },
  });

  proxyToOriginalObject.set(proxy, object);
  return proxy;
}

function stringValueToKey(str: string): string | number {
  const asNumber = Number(str);
  if (!Number.isNaN(asNumber)) return asNumber;
  return str;
}

export function replaySniffedOperations(object: any, ops: SniffedOperation[]) {
  assert(typeof object === 'object' && object !== null);
  assert(!Reflect.get(object, sniffed, object));

  for (const op of ops) {
    assert(op.path[0] === '.');

    const pathComponents = op.path.split('.');
    let obj = object;
    for (let i = 1; i < pathComponents.length - 1; i++) {
      const nextKey = stringValueToKey(pathComponents[i]);
      let next = obj.constructor === Map ? obj.get(nextKey) : obj[nextKey];
      if (!next) {
        // Assumes this should be an object. May be problematic.
        next = obj[pathComponents[i]] = {};
      }
      obj = next;
    }

    const key = stringValueToKey(pathComponents[pathComponents.length - 1]);
    if (op.splice) {
      const array = obj[key];
      assert(Array.isArray(array));
      array.splice(op.splice.start, op.splice.deleteCount, ...op.splice.items);
    } else if (op.deleteIndices) {
      const array: any[] = obj[key];
      assert(Array.isArray(array));
      obj[key] = array.filter((_, i) => {
        return !op.deleteIndices?.includes(i);
      });
    } else if (op.delete !== undefined) {
      const mapOrSet: Map<any, any> | Set<any> = obj[key];
      assert(mapOrSet.constructor === Map || mapOrSet.constructor === Set);
      mapOrSet.delete(op.delete);
    } else if (op.add !== undefined) {
      const set: Set<any> = obj[key];
      assert(set.constructor === Set);
      set.add(op.add);
    } else {
      if (obj.constructor === Map) {
        obj.set(key, op.value);
      } else {
        obj[key] = op.value;
      }
    }
  }
}
