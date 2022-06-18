const sniffed = Symbol();

export interface SniffedOperation {
  path: string;
  newValue?: any;
  splice?: {start: number; deleteCount: number; items: any[]};
  clear?: boolean;
  deleteMapKey?: string | number;
  deleteIndices?: number[];
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
          cb({path, newValue: value});
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
      if ((target.constructor === Map || target.constructor === Set) && typeof targetValue === 'function') {
        const targetMethod = targetValue.bind(target);

        if (prop === 'set') {
          const origTargetMethod = targetMethod;
          return (k: string | number, v: string) => {
            origTargetMethod(k, v);
            cb({path: `${prefix}.${k}`, newValue: v});
          };
        } else if (prop === 'delete') {
          const origTargetMethod = targetMethod;
          return (k: string | number, v: string) => {
            origTargetMethod(k, v);
            cb({path: prefix, deleteMapKey: k});
          };
        } else if (prop === 'get') {
          const origTargetMethod = targetMethod;
          return (k: string | number) => {
            return sniffObject(origTargetMethod(k), cb, `${prefix}.${k}`);
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
