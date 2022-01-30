declare namespace NodeJS {
  interface Global {
    performance: typeof window.performance;
  }
}

interface AddEventListenerOptions {
  signal?: AbortSignal;
}

declare namespace PIXI {
  export * from 'pixi.js';
}

// This is code split'd.
declare let PIXI: import('pixi.js');
declare let pixiSound: import('pixi-sound');
declare let OutlineFilter: import('@pixi/filter-outline');

type Array2D<T> = T[][];
type Array3D<T> = T[][][];

interface Point2 {
  x: number;
  y: number;
}

interface Point3 {
  x: number;
  y: number;
  z: number;
}

interface Point4 {
  w: number;
  x: number;
  y: number;
  z: number;
}

interface Meta {
  nextCreatureId: number;
  worldDataDefinition: WorldDataDefinition;
  time: number;
}

interface PartitionMeta {
  name: string;
  width: number;
  height: number;
  depth: number;
}

type ScreenPoint = Point2;
type PartitionPoint = Point3;
type TilePoint = Point4; // `w` is world index

type Region = Point4 & { width: number; height: number };

interface Binding {
  key?: number;
  mouse?: number;
  shift?: boolean;
  control?: boolean;
  alt?: boolean;
  meta?: boolean;
}

type BindingsNames = |
'actionMenu' |
'attack' |
'moveTo' |
'pickup' |
'targetNext' |
'targetPrevious' |
'toggleInventory' |
'toggleMap' |
'toggleSkills' |
'useHand' |
'useTool';

interface Settings {
  bindings: Record<BindingsNames, Binding>;
  showGrid: boolean;
  sfxVolume: number;
  musicVolume: number;
  lightMode: number;
  clickMagic: boolean;
  labelBackground: boolean;
  scale: number;
  limitView: boolean;
}

interface GridiaAccount {
  /** A unique, secret id. */
  id: string;
  playerIds: string[];
  settings?: Partial<Settings>;
}

interface Player {
  id: string;
  name: string;
  loggedIn: boolean;
  /** In seconds. */
  timePlayed: number;
  lastLogin: number;
  lastSaved: number;
  attributes: Map<string, { baseLevel: number; earnedLevel: number }>;
  skills: Map<number, { xp: number }>;
  /** Skills that earn 2x xp. */
  specializedSkills: Set<number>;
  skillPoints: number;
  containerId: string;
  equipmentContainerId: string;
  isAdmin: boolean;
  questStates: Map<string, QuestState>;
  tilesSeenLog: Map<string, Uint16Array>;
  pos: Point4;
  spawnPos: Point4;
  life: number;
  stamina: number;
  mana: number;
  food: number;
  buffs: Buff[];
  tamedCreatureIds: Set<number>;
}

interface Container {
  id: string;
  type: 'normal' | 'equipment' | 'merchant';
  items: Array<Item | null>;
}

interface Tile {
  floor: number;
  item?: Item; // Prefer undefined over null.
  elevation: number;
}

interface WorldLocation {
  source: 'world';
  pos: TilePoint;
}

interface ContainerLocation {
  source: 'container';
  id: string;
  index?: number;
}

// TODO: rename to Location
/** Either a world location or from a container. */
type ItemLocation = WorldLocation | ContainerLocation;

interface PossibleUsage {
  toolIndex: number;
  usageIndex: number;
  use: ItemUse;
  focusLocation: ItemLocation;
}

type Sector = Tile[][];

interface Item {
  type: number;
  quantity: number;
  growth?: number;
  containerId?: string;
  buff?: Buff;
  warpTo?: TilePoint;
  oreType?: number;
  textContent?: string;
}

interface Creature {
  id: number;
  /** Refers to monster template id, if used. */
  type?: number;
  dead: boolean;
  graphics: Graphics;
  /** If set, these graphics are composed on top of the main graphic. */
  equipmentGraphics?: Graphics[];
  // imageData?: CreatureImageData;
  name: string;
  canSpeak?: boolean;
  pos: TilePoint;
  isPlayer: boolean;
  /** player id */
  tamedBy?: string;
  roam?: number;
  speed: number;
  life: { current: number; max: number };
  stamina: { current: number; max: number };
  mana: { current: number; max: number };
  food: number;
  eatGrass: boolean;
  light: number;
  equipment?: Array<Item | null>;
  merchant?: {
    containerId: string;
  };
  combatLevel: number;
  stats: {
    armor: number;
    attackSpeed: number;
    damageLow: number;
    damageHigh: number;
    magicDefense: number;
    meleeDefense: number;
    missleDefense: number;
  };
  magicLevel?: number;
  magicChances?: Monster['magicChances']; // TODO ...
  buffs: Buff[];
  tameable?: boolean;
}

interface CreatureDescriptor {
  type: number;
  partial?: Partial<Creature>;
  onSpeak?: import('./server/creature-state').default['onSpeakCallback'];
}

interface Buff {
  id: string;
  /** UNIX epoch. For items, this field is used as a turn counter (buff goes away at 0). */
  expiresAt: number;
  /** -1 is all */
  skill?: number;
  attribute?: string;
  linearChange?: number;
  percentChange?: number;
}

interface Graphics {
  file: string;
  frames: number[];
  /** How many tiles wide a frame is. The anchor point is the top-left tile. */
  width?: number;
  /** How many tiles tall a frame is. The anchor point is the top-left tile. */
  height?: number;
  templateType?: TemplateType;
  templateData?: TemplateData;
}

// TODO: as array?
interface TemplateData {
  0: number;
  rb: number;
  lrb: number;
  lb: number;
  rab: number;
  lrab: number;
  lab: number;
  ra: number;
  lra: number;
  la: number;
}

type TemplateType = 'bit-offset' | 'visual-offset' | 'misc-offset-1' | 'data-offset' | 'elevation-offset';

interface MetaFloor {
  id: number;
  graphics: Graphics;
  color: string;
}

interface MetaItem {
  id: number;
  name: string;
  class:
  'Normal' | 'Armor' | 'Ore' | 'CaveDown' | 'CaveUp' | 'Container' |
  'Ball' | 'Weapon' | 'Ammo' | 'Plant' | 'Shield' | 'Wand' | 'Raft' |
  'Goal' | 'Jewelry' | 'Food';
  equipSlot?: 'Head' | 'Weapon' | 'Chest' | 'Shield' | 'Legs' | 'Ammo' | 'Neck' | 'Finger' | 'Wrist';
  equipImage?: Graphics;
  graphics: Graphics;
  burden: number;
  value?: number;
  growthDelta?: number;
  growthItem?: number;
  // TODO: notMoveable?: boolean;
  moveable: boolean;
  light?: number;
  blocksLight?: boolean;
  rarity: number;
  stackable?: boolean;
  blocksMovement?: boolean;
  trapEffect?: 'Warp';
  combatSkill?: number;
  armorLevel?: number;
  attackSpeed?: number;
  damageLow?: number;
  damageHigh?: number;
  ammoType?: number;
  minRange?: number;
  maxRange?: number;
  readable?: boolean;
  food?: number;
  foodStamina?: number;
  foodMana?: number;
  foodLife?: number;
  standDamage?: number;
}

interface ItemUse {
  animation?: string;
  successMessage: string;
  tool: number;
  focus: number;
  toolQuantityConsumed: number;
  focusQuantityConsumed: number;
  successTool?: number;
  successFloor?: number;
  products: Array<{ type: number; quantity: number }>;
  skillId?: number;
  /** When usage starts to be possible 0% of the time (but with a min of 1%) */
  minimumSkillLevel?: number;
  /** When usage starts to be possible 100% of the time */
  maximumSkillLevel?: number;
  skillSuccessXp?: number;
}

interface Skill {
  id: number;
  name: string;
  description: string;
  skillPoints: number;
  category: string;
  purpose: string;
  divisor: number;
  quickness?: number;
  dexterity?: number;
  strength?: number;
  intelligence?: number;
  wisdom?: number;
}

interface Spell {
  id: number;
  name: string;
  description: string;
  mana: number;
  skill: number;
  range: number;
  target: 'self' | 'other' | 'world';
  successXp: number;
  failureXp: number;
  life?: number;
  stamina?: number;
  variance?: number;
  animation?: number;
  projectileAnimation?: number;
  castTime: number;
  quickness?: number;
  dexterity?: number;
  strength?: number;
  intelligence?: number;
  wisdom?: number;
  hero?: number;
  spawnItems?: Item[];
  transformItemFrom?: Item;
  transformItemTo?: Item;
}

interface GridiaAnimation {
  name: string;
  frames: Array<{
    sprite: number;
    sound?: string;
  }>;
  directionalFrames?: boolean;
}

interface GridiaAnimationInstance {
  name: string;
  path: Point4[];
}

interface DropTableEntryBase {
  /** 0-100. Defaults to 100. */
  chance?: number;
  quantity?: number;
}

interface DropTableRef extends DropTableEntryBase {
  type: 'ref';
  id: string;
}

interface DropTableOneOf extends DropTableEntryBase {
  type: 'one-of';
  values: DropTableEntry[];
}

interface DropTableValue extends DropTableEntryBase {
  type: number;
}

type DropTableEntry = DropTableRef | DropTableOneOf | DropTableValue;
type LootTable = DropTableEntry[];

interface Monster {
  id: number;
  name: string;
  graphics: Creature['graphics'];
  speed: number;
  life: number;
  stamina?: number;
  mana?: number;
  magicDefense?: number;
  meleeDefense?: number;
  missleDefense?: number;
  roam?: number;
  eatGrass: boolean;
  deadItem?: number;
  equipment?: Array<Item | null>;
  lootTable?: LootTable;
  magicLevel?: number;
  magicChances?: Array<{
    spellId: number;
    /** 0-100 */
    chance: number;
  }>;
  tameable?: boolean;
}

interface Quest {
  id: string;
  name: string;
  description: string;
  stages: string[];
}

interface QuestState {
  stage: string;
  data: Object;
}

interface Dialogue {
  speakers: Creature[];
  parts: DialoguePart[];
  onFinish?: () => void;
}

interface DialoguePart {
  speaker: number;
  text: string;
  choices?: any[];
}

interface UIState {
  clickTileMode?: {
    onClick(location: WorldLocation);
    itemCursor?: Item | null;
  };
  mouse: {
    x: number;
    y: number;
    tile?: TilePoint;
    downTile?: TilePoint;
    state: string;
  };
  selectedView: {
    location?: ItemLocation;
    creatureId?: number;
    actions: GameAction[];
  };
  elapsedFrames: number;
  containers: {
    [id: string]: {
      selectedIndex: number | null;
    };
  };
}

interface GameAction {
  type: string;
  innerText: string;
  title: string;
  extra?: any;
}

type GameActionCreator = (location: ItemLocation) => GameAction[] | GameAction | undefined;

// https://stackoverflow.com/a/49397693
type NoMethodKeys<T> = ({ [P in keyof T]: T[P] extends Function ? never : P })[keyof T];
type NoMethods<T> = Pick<T, NoMethodKeys<T>>;

interface ServerOptions {
  verbose: boolean;
  // TODO: this shouldn't be in options ...
  worldDataDef: WorldDataDefinition;
}

interface CLIOptions extends ServerOptions {
  directoryPath: string;
  port: number;
  ssl?: {
    cert: string;
    key: string;
  };
}

interface ServerWorkerOpts extends ServerOptions {
  mapName: string;
  useMapPreview?: boolean;
}

interface CharacterCreationPreset {
  name: string;
  attributes: Record<string, number>;
  skills: number[];
  specializedSkills: number[];
}

interface WorldDataDefinition {
  tileSize: number;
  baseDir: string;
  characterCreation: {
    attributes: Array<{name: string; derived?: {from: string; creationMultiplier?: number}}>;
    attributePoints: number;
    skillPoints: number;
    requiredSkills?: number[];
    simple?: boolean;
    presets?: CharacterCreationPreset[];
  };
}

interface ScriptState {
  id: string;
  state: string;
  config: any;
  errors: ScriptError[];
}

interface ScriptError {
  text: string;
  stack?: Error;
  data?: any;
}
