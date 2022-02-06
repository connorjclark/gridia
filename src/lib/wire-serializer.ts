// https://gist.github.com/jimmywarting/a6ae45a9f445ca352ed62374a2855ff2

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TextDecoder = globalThis.TextDecoder || require('u' + 'til').TextDecoder;

/* eslint-disable */
const {replacer,reviver} = ((types, b64) => ({
  // @ts-expect-error
  replacer(key) {
    // @ts-expect-error
    var val = this[key]

    return val === Infinity ? { $n: 1 }:
           val === -Infinity ? { $n: -1 }:
           Number.isNaN(val) ? { $n: ' ' }:
           // @ts-expect-error
           val instanceof Date ? { $t: isNaN(val) ? '!' : +val }:
           val instanceof Map ? { $m: [...val] }:
           val instanceof Set ? { $s: [...val] }:
           val instanceof TypeError ? { $1: [val.message, val.stack] }:
           val instanceof Error ? { $e: [val.message, val.stack] }:
           val instanceof RegExp ? { $r: [val.source, val.flags] }:
           // @ts-expect-error
           ArrayBuffer.isView(val) || val instanceof ArrayBuffer ? { $b: [types.indexOf(val.constructor), b64.encode(new Uint8Array(val.buffer))]}:
           typeof val === 'bigint' ? { $i: val+'' }:
           val
  },
  // @ts-expect-error
  reviver: (key, val) =>
      val === null && val !== 'object' ? val:
      val.$n ? val.$n/0:
      val.$t ? new Date(val.$t):
      // @ts-expect-error
      val.$r ? new RegExp(...val.$r):
      // @ts-expect-error
      val.$f ? new File(...val.$f):
      val.$d ? new Blob(...val.$d):
      val.$e ? (key = new Error(val.$e[0]), key.stack = val.$e[1], key):
      val.$1 ? (key = new TypeError(val.$1[0]), key.stack = val.$1[1], key):
      val.$m ? new Map(val.$m):
      val.$s ? new Set(val.$s):
      val.$b ? val.$b[0]
        // @ts-expect-error
        ? new types[val.$b[0]](b64.decode(val.$b[1], types[val.$b[0]].BYTES_PER_ELEMENT).buffer)
        : new Uint8Array(b64.decode(val.$b[1], 1)).buffer:
      val.$i ? BigInt(val.$i):
      val 
}))([ArrayBuffer, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array], (()=>{var f=[65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,48,49,50,51,52,53,54,55,56,57,45,95,61],h=[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,62,null,62,null,63,52,53,54,55,56,57,58,59,60,
// @ts-expect-error
61,null,null,null,64,null,null,null,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,null,null,null,null,63,null,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,null,null];return{decode(a,bytesper){ var b=a.length%4;b&&(a+=Array(5-b).join("="));b=-1;var l=a.length/4*3; l = l - l%bytesper; var f=new ArrayBuffer(l),d,e=new Uint8Array(f),c=0;for(d=a.length;++b<d;){var g=h[a.charCodeAt(b)],k=h[a.charCodeAt(++b)];e[c++]=g<<2|k>>4;g=h[a.charCodeAt(++b)];if(64===g)break;e[c++]=(k&15)<<
// @ts-expect-error
4|g>>2;k=h[a.charCodeAt(++b)];if(64===k)break;e[c++]=(g&3)<<6|k} return new Uint8Array(f,0,c)},encode(a){for(var b=-1,h=a.length,d=new Uint8Array(new ArrayBuffer(Math.ceil(4*h/3))),e=0;++b<h;){var c=a[b],g=a[++b];d[e++]=f[c>>2];d[e++]=f[(c&3)<<4|g>>4];isNaN(g)?(d[e++]=f[64],d[e++]=f[64]):(c=a[++b],d[e++]=f[(g&15)<<2|c>>6],d[e++]=f[isNaN(c)?64:c&63])}return new TextDecoder().decode(d)}}})())
/* eslint-enable */

export function serialize(object: any) {
  return JSON.stringify(object, replacer);
}

// TODO: add T return type
export function deserialize<T>(json: string) {
  return JSON.parse(json, reviver);
}
