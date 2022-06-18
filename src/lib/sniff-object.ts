const sniffed = Symbol();

export interface SniffedOperation {
  path: string;
  newValue?: any;
  splice?: {start: number; deleteCount: number; items: any[]};
  deleteIndices?: number[];
}

// function forceSniffObject<T extends object>(object: T, cb: (op: SniffedOperation) => void, prefix = '') {
//   for (const [key, value] of Object.entries(object)) {
//     if (typeof value === 'object') {
//       forceSniffObject(value, cb, `${prefix}.${key}`);
//     }
//   }

//   // delete object[sniffed];
//   return sniffObject(object, cb, prefix);
// }

const proxyToOriginalObject = new WeakMap();
function unwrap(proxy: any) {
  if (typeof proxy !== 'object' || proxy === null) return proxy;

  const originalObject = proxyToOriginalObject.get(proxy) ?? proxy;
  for (const [key, value] of Object.entries(originalObject)) {
    originalObject[key] = unwrap(originalObject[key]);
  }

  return originalObject;
}

export function sniffObject<T extends object>(object: T, cb: (op: SniffedOperation) => void, prefix = '') {
  // if (object[sniffed]) throw new Error('...')

  // for (const [key, value] of Object.entries(object)) {
  //   if (typeof value === 'object') {
  //     Reflect.set(object, key, sniffObject(value, cb, `${prefix}.${key}`), object);
  //   }
  // }

  const proxy: T = new Proxy(object, {
    set(target, prop, value, reciever) {
      value = unwrap(value);

      if (Array.isArray(value) && Array.isArray(target[prop])) {
        // console.log({target, prop, value});

        // Possibly was a filter, try to detect which indices were deleted.
        // if (value.length < target[prop].length) {
        //   const deleteIndices = [];
        //   for (let i = 0; i < target[prop].length; i++) {

        //   }
        // }

        const targetArray = Reflect.get(target, prop, target);
        // console.log(targetArray[0]);
        // for (let i = 0; i < value.length; i++) {
        // console.log(value[i], targetArray[i], value[i] === targetArray[i], targetArray.indexOf(value[i]));
        // if (value[i] !== targetArray[i]) {
        //   // @ts-expect-error does not support symbols.
        //   const path = `${prefix}.${prop}.${i}`;
        //   cb({path, newValue: value[i]});
        // }
        // cb({path, newValue: value[i]});
        // }

        // if (value.length < targetArray.length) {
        //   // @ts-expect-error does not support symbols.
        //   const path = `${prefix}.${prop}.length`;
        //   cb({path, newValue: value.length});
        // }

        // @ts-expect-error does not support symbols.
        // const path = `${prefix}.${prop}`;
        // if (typeof value === 'object') value = forceSniffObject(value, cb, path);

        // return Reflect.set(target, prop, value, reciever);
      }

      if (!(Array.isArray(target) && prop === 'length')) {
        // @ts-expect-error does not support symbols.
        const path = `${prefix}.${prop}`;
        cb({path, newValue: value});
        // invokeCallback(target, {path, newValue: value});
        // if (typeof value === 'object') value = sniffObject(value, cb, path);
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
          // invokeCallback(target, {path: prefix, splice: {start, deleteCount, items}});
          origMethod.apply(target, args);
        };
      }
      // else if (prop === 'filter') {
      //   const origMethod = Reflect.get(target, prop, reciever);

      //   return (predicate: any) => {
      //     const deleteIndices: number[] = [];
      //     const newPredicate = (value: any, i: number, array: any[]) => {
      //       const result = predicate(value, i, array);
      //       if (!result) deleteIndices.push(i);
      //       return result;
      //     };
      //     const filtered = origMethod.apply(target, [newPredicate]);
      //     cb({path: prefix, deleteIndices});
      //     return sniffObject(filtered, cb, prefix);
      //   };
      // }

      // const targetValue = Reflect.get(target, prop, reciever);
      const targetValue = Reflect.get(target, prop, reciever);
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
