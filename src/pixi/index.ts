import { OutlineFilter as OutlineFilter_ } from '@pixi/filter-outline';
import * as PIXI_ from 'pixi.js';
// TODO: This breaks some input–afaik just the text input in admin panel.
// defer until needed for deferred lighting.
// import type {} from 'pixi-layers';

// globalThis.PIXI = PIXI;
// require('pixi-layers');

// @ts-expect-error
globalThis.PIXI = PIXI_;
// @ts-expect-error
globalThis.OutlineFilter = OutlineFilter_;

document.addEventListener('click', async () => {
  globalThis.PIXI.sound = (await import('pixi-sound'));
}, { once: true });
