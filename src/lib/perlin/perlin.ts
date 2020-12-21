/* eslint-disable */
// https://flafla2.github.io/2014/08/09/perlinnoise.html
// https://gpfault.net/posts/perlin-noise.txt.html
// https://stackoverflow.com/a/12964860

export function init(random: () => number) {
  PERMUTATION = createPermutation(random);
}

// Hash lookup table as defined by Ken Perlin. This is a randomly
// arranged array of all numbers from 0-255 inclusive.
let PERMUTATION: number[];
function createPermutation(random: () => number) {
  const p = [];
  for (let i = 0; i < 256; i++) {
    p.push(i);
  }
  p.sort(() => random() - 0.5);
  return p;
}

interface Options {
  width: number;
  height: number;
  octaves: number;
  persistence: number;
}

function fade(t: number) {
  // Fade function as defined by Ken Perlin.  This eases coordinate values
  // so that they will ease towards integral values.  This ends up smoothing
  // the final output.
  // 6t^5 - 15t^4 + 10t^3
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad(hash: number, x: number, y: number, z: number) {
  switch (hash & 0xF) {
    case 0x0: return x + y;
    case 0x1: return -x + y;
    case 0x2: return x - y;
    case 0x3: return -x - y;
    case 0x4: return x + z;
    case 0x5: return -x + z;
    case 0x6: return x - z;
    case 0x7: return -x - z;
    case 0x8: return y + z;
    case 0x9: return -y + z;
    case 0xA: return y - z;
    case 0xB: return -y - z;
    case 0xC: return y + x;
    case 0xD: return -y + z;
    case 0xE: return y - x;
    case 0xF: return -y - z;
    default: return 0; // never happens
  }
}

function lerp(a: number, b: number, x: number) {
  return a + x * (b - a);
}

function perlin(x: number, y: number) {
  const xi = x & 255;
  const yi = y & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  // Hash.
  const p = PERMUTATION;
  const A = p[xi] + yi, aa = p[A], ab = p[A + 1],
    B = p[xi + 1] + yi, ba = p[B], bb = p[B + 1];

  // The gradient function calculates the dot product between a pseudorandom
  // gradient vector and the vector from the input coordinate to the 8
  // surrounding points in its unit cube.
  // This is all then lerped together as a sort of weighted average based on the faded (u,v,w)
  // values we made earlier.
  let x1, x2;
  x1 = lerp(
    grad(aa, xf, yf, 0),
    grad(ba, xf - 1, yf, 0),
    u);
  x2 = lerp(
    grad(ab, xf, yf - 1, 0),
    grad(bb, xf - 1, yf - 1, 0),
    u);
  const noise = lerp(x1, x2, v);

  // For convenience we bind the result to 0 - 1 (theoretical min/max before is [-1, 1])
  return (noise + 1) / 2;
}

export function generatePerlinNoise(options: Options) {
  const noise = [];

  for (let y = 0; y < options.height; y++) {
    for (let x = 0; x < options.width; x++) {
      let maxValue = 0;
      let amplitude = 1;
      let frequency = 1;
      let value = 0;
      for (let i = 0; i < options.octaves; i++) {
        value += perlin((x / options.width) * frequency, (y / options.height) * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= options.persistence;
        frequency *= 2;
      }
      noise.push(value / maxValue);
    }
  }

  return noise;
}

// const options = {
//   width: 80,
//   height: 20,
//   octaves: 1,
//   persistence: 0.5,
// };
// const noise = generatePerlinNoise(options);
// let output = '';
// for (let y = 0; y < options.height; y++) {
//   for (let x = 0; x < options.width; x++) {
//     const value = Math.round(noise[x + y * options.width] * 100);
//     output += value.toString().padEnd(3);
//   }
//   output += '\n';
// }
// console.log(output);

// output = '';
// for (let x = 0; x < options.width; x++) {
//   const value = Math.round(noise[x] * 100);
//   output += value.toString().padEnd(3);
// }
// console.log(output);
