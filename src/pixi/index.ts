import { OutlineFilter } from '@pixi/filter-outline';
import { Scrollbox } from 'pixi-scrollbox';
import PIXISound from 'pixi-sound';
import TextInput from 'pixi-text-input';
import * as PIXI from 'pixi.js';

globalThis.PIXI = PIXI;
globalThis.PIXI.sound = PIXISound;
globalThis.PIXI.Scrollbox = Scrollbox;
globalThis.PIXI.OutlineFilter = OutlineFilter;
globalThis.PIXI.TextInput = TextInput;
