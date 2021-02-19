import { OutlineFilter } from '@pixi/filter-outline';
import PIXISound from 'pixi-sound';
import * as PIXI from 'pixi.js';
// TODO: This breaks some input–afaik just the text input in admin panel.
// defer until needed for deferred lighting.
// import type {} from 'pixi-layers';

// globalThis.PIXI = PIXI;
// require('pixi-layers');

globalThis.PIXI = PIXI;
globalThis.PIXI.sound = PIXISound;
globalThis.PIXI.OutlineFilter = OutlineFilter;
