import { OutlineFilter as OutlineFilter_ } from '@pixi/filter-outline';
import pixiSound_ from 'pixi-sound';
import * as PIXI_ from 'pixi.js';
// TODO: This breaks some input–afaik just the text input in admin panel.
// defer until needed for deferred lighting.
// import type {} from 'pixi-layers';

// globalThis.PIXI = PIXI;
// require('pixi-layers');

// @ts-expect-error
globalThis.PIXI = PIXI_;
globalThis.PIXI.sound = pixiSound_;
// @ts-expect-error
globalThis.OutlineFilter = OutlineFilter_;

