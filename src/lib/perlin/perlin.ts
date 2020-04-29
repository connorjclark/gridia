// tslint:disable
// https://flafla2.github.io/2014/08/09/perlinnoise.html
// https://gpfault.net/posts/perlin-noise.txt.html
// https://stackoverflow.com/a/12964860

// Hash lookup table as defined by Ken Perlin. This is a randomly
// arranged array of all numbers from 0-255 inclusive.
const PERMUTATION = [151, 160, 137, 91, 90, 15,
  131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23,
  190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33,
  88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166,
  77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244,
  102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196,
  135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123,
  5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42,
  223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
  129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228,
  251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107,
  49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254,
  138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180];

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

function grad(hash: number, x: number, y: number) {
  switch (hash & 6) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    case 4: return y + x;
    case 5: return y - x;
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
  // const aa = p[p[xi] + yi];
  // const ab = p[p[xi] + (yi+1)];
  // const ba = p[p[(xi+1)] + yi];
  // const bb = p[p[(xi+1)] + (yi+1)];

  const A = p[xi    ] + yi, aa = p[A], ab = p[A + 1],
  B = p[xi + 1] + yi, ba = p[B], bb = p[B + 1];

  // The gradient function calculates the dot product between a pseudorandom
  // gradient vector and the vector from the input coordinate to the 8
  // surrounding points in its unit cube.
  // This is all then lerped together as a sort of weighted average based on the faded (u,v,w)
  // values we made earlier.
  let x1, x2;
  x1 = lerp(
    grad(aa, xf, yf),
    grad(ba, xf - 1, yf),
    u);
  x2 = lerp(
    grad(ab, xf, yf - 1),
    grad(bb, xf - 1, yf - 1),
    u);
  // return (1.0 - v) * x1 + v * x2;
  // y1 = lerp(x1, x2, v);
  return lerp(x1, x2, v);
  // return y1;
  // return (lerp(y1, y2, w) + 1) / 2;

  // For convenience we bind the result to 0 - 1 (theoretical min/max before is [-1, 1])
  // return (lerp(y1, y2, w) + 1) / 2;
}

export function generatePerlinNoise(options: Options) {
  const noise = [];

  for (let x = 0; x < options.width; x++) {
    for (let y = 0; y < options.height; y++) {
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

export function generatePerlinNoise2(options: Options) {
  const noisejs = require('./noisejs.js').noise;
  noisejs.seed(Math.random());
  const noise = [];

  for (let x = 0; x < options.width; x++) {
    for (let y = 0; y < options.height; y++) {
      let maxValue = 0;
      let amplitude = 1;
      let frequency = 1;
      let value = 0;
      for (let i = 0; i < options.octaves; i++) {
        const perlin2 = noisejs.perlin2;
        const v = perlin2((x / options.width) * frequency, (y / options.height) * frequency);
        value += (v + 1) / 2 * amplitude;
        maxValue += amplitude;
        amplitude *= options.persistence;
        frequency *= 2;
      }
      noise.push(value / maxValue);
    }
  }

  return noise;
}
