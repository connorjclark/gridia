export const MAX_STACK = 1_000_000_000;
export const WATER = 1;
export const MINE = 3183;
export const SECTOR_SIZE = 20;

// TODO: not-so-constant, but this makes the consuming code a bit simpler...
export function setGfxSize(size: number) {
  GFX_SIZE = size;
}
// Size of tile in sprite template and world coordinates.
export let GFX_SIZE = 32;
