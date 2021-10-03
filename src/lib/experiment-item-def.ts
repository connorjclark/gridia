// yarn ts-node src/lib/experiment-item-def.ts

/*
(old notes)
```
define Tree:
  product: ?
  yeild: 5

  stump: defineitem(name: '<product> Tree Stump', graphic: 123)
  sprouting: defineitem(name: 'Sprouting <product> Tree', graphic: 895)
  young: defineitem(name: 'Young <product> Tree', graphic: 896)
  flowering: defineitem(name: 'Flowering <product> Tree')
  ripening: defineitem(name: 'Ripening <product> Tree')
  ripe: defineitem(name: 'Ripe <product> Tree')
  dormant: defineitem(name: 'Dormant <product> Tree')

  effects:
    - tick(stump, sprouting, time=10 days)
    - tick(sprouting, young, time=1 day)
    - tick(young, flowering, time=1 day)
    - tick(flowering, ripening, time=1 day)
    - tick(ripening, ripe, time=6 hours)
    - tick(ripe, dormant, time=2 days)

    - usage(hand, ripe, '<product>', quantity: '<yeild>')
      - item(<product>, quantity: '<yield>')

    - usage(axe, sprouting):
      - item(name: '<stump>')
      - item(name: 'small branches')

    - usage(axe, young): stump, 1 logs, 1 branches
    - usage(axe, flowering|ripening|dormant): stump, 2 logs, 2 branches
    - usage(axe, ripe): stump, 2 logs, 2 branches, <yield/2> <product>
```
(TODO: missing seeds)

Above will create a "Generic Item Type" called `Tree`
then a money tree item could be made... `{type: 'Tree', subtype: 'ripe', product: 'Gold', yield: 10}`
... AKA a generic tree item. can grow anything.

But also can be expanded in the item definitions file.
This will create many concrete definitions for various orange tree items:

```
Orange:
  Food: 100

Tree:
  product: Orange
  yield: 5
  flowering:
    graphic: 802
  ripening:
    graphic: 803
  ripe:
    graphic: 804
```
will makes these items, with the appropriate item usages...

- Sprouting Orange Tree
- Flowering Orange Tree
- Ripening Orange Tree
- Ripe Orange Tree
- Dormant Orange Tree


Another example

Wall:
  name: ?
  material: ?

  items:
    ns_closed:
      item:
        name: 'NS Closed <material> Door Wall
    ew_closed:
      item:
        name: 'EW Closed <material> Door Wall
    ns_open:
      item:
        name: 'NS Open <material> Door Wall
    ew_open:
      item:
        name: 'EW Open <material> Door Wall

  other:
    - item:
        name: '<material> Wall'
        graphic: '<material>'


  effects:
    - usage:
        tool: hand
        focus: <ns_closed>
        success: <ns_open>
    - usage:
        tool: hand
        focus: <ns_open>
        success: <ns_closed>
    - <items>:
      - usage:
          tool: axe
          focus: <item>
          success: <ns_closed>

Wall:
  name: Wood
  material: Wood Planks

Wall:
  name: Stone
  material: Wood Planks


Sword:
  name: ?
  material: ?
  level: ?

  items:
    sword:
      item:
        name: <name>
        type: sword

  creation:
    usage:
      tool: Hot <material> Sheet
      focus: Anvil
      successTool: <sword>

  <!-- repair:
    usage:
      tool: <sword>
      focus: Anvil
      resetWeapon: true -->

usage:
  tool:
    type: sword
  focus: Anvil
  resetWeapon: true


Sword:
  name: Long Sword
  material: Iron

YAML good?
*/

// @ts-expect-error
type MetaItem = any; // ...
// @ts-expect-error
type ItemUse = any; // ...

type Property = { [key: string]: Property } | Property[] | ProgramNode | string | number | boolean | null | undefined;

type ProgramNode = GlobalsNode | DefineItemNode | UsageNode | TickNode | TemplateNode | UseTemplateNode;

interface GlobalsNode {
  type: 'globals';
  data: {
    scopeName: string;
    properties: { [key: string]: Property };
  };
}

interface DefineItemNode {
  type: 'define-item';
  data: { [key: string]: Property };
}

interface UsageNode {
  type: 'usage';
  data: { [key: string]: Property };
}

interface TickNode {
  type: 'tick';
  data: { [key: string]: Property };
}

interface TemplateNode {
  type: 'template';
  data: {
    name: string;
    properties: { [key: string]: Property };
  };
}

interface UseTemplateNode {
  type: 'use-template';
  data: {
    templateName: string;
    properties: { [key: string]: Property };
  };
}


interface ItemDeclaration {
  template?: string;
  properties: { [key: string]: Property };
}

// eslint-disable-next-line max-len
function walkObject(obj: any, callback: (obj_: any, key: string, value: any, path_: string[], cb: any) => void | boolean, path: string[] = [], seen = new WeakSet()) {
  if (obj === null) {
    return;
  }

  // Prevent circular references from making this function run forever.
  if (obj instanceof Object && seen.has(obj)) {
    return;
  }
  seen.add(obj);

  Object.entries(obj).forEach(([fieldName, fieldValue]) => {
    const newPath = Array.from(path);
    newPath.push(fieldName);

    const retVal = callback(obj, fieldName, fieldValue, newPath, obj);
    if (retVal !== false && typeof fieldValue === 'object') {
      walkObject(fieldValue, callback, newPath, seen);
    }
  });
}

function mergeObject(target: any, ...sources: any[]): any {
  if (sources.length === 0) return target;

  const source = sources.shift();
  for (const key of Object.keys(source)) {
    const value = source[key];

    if (Array.isArray(value)) {
      target[key] = [];
      mergeObject(target[key], source[key]);
    } else if (value instanceof Object) {
      if (!(key in target) || target[key] === null) {
        target[key] = {};
      }
      mergeObject(target[key], source[key]);
    } else {
      target[key] = value;
    }
  }

  return mergeObject(target, ...sources);
}

function resolveObjectPath(obj: any, path: string[]) {
  const allButLast = path.slice(0, path.length - 1);
  const last = path[path.length - 1];

  for (const key of allButLast) {
    if (obj[key] && obj[key] instanceof Object) {
      obj = obj[key];
    } else {
      return;
    }
  }

  if (last in obj) {
    return obj[last];
  }
}

// Resolves an identifier, like 'items.stump', starting
// from the provided path. Walk up the path until the first token ('items')
// of the identifier is found, then resolve the rest from there.
function resolveIdentifier(obj: any, identifier: string, path: string[]) {
  const identifierPath = identifier.split('.');

  const first = identifierPath[0];
  const rest = identifierPath.slice(1, identifierPath.length);

  const currentPath = [...path];
  currentPath.pop();
  // Avoids resolving to itself. ex: {burden: '<burden>'}
  if (path[path.length - 1] === identifier) currentPath.pop();

  while (currentPath.length >= 0) {

    const value = resolveObjectPath(obj, [...currentPath, first]);
    if (value !== undefined) {
      obj = value;
      break;
    }

    if (currentPath.length === 0) {
      throw new Error(`cannot resolve identifier: ${identifier} from ${path.join('.')}`);
    }
    currentPath.pop();
  }

  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];

    if (i === rest.length || (obj[key] && obj[key] instanceof Object)) {
      obj = obj[key];
    } else {
      return;
    }
  }

  return obj;
}

function globals_(scopeName: string, properties: TemplateNode['data']['properties']): GlobalsNode {
  return {type: 'globals', data: {scopeName, properties}};
}

function defineItem_(data: DefineItemNode['data']): DefineItemNode {
  return {type: 'define-item', data};
}

function item_(data: Partial<MetaItem>) {
  return {type: 'item', data};
}

function usage_(data: any): UsageNode {
  return {type: 'usage', data};
}

function tick_(from: string, to: string, time: string): TickNode {
  return {type: 'tick', data: {from, to, time}};
}

function template_(name: string, properties: TemplateNode['data']['properties']): TemplateNode {
  return {type: 'template', data: {name, properties}};
}

function useTemplate_(templateName: string, properties: UseTemplateNode['data']['properties']): UseTemplateNode {
  return {type: 'use-template', data: {templateName, properties}};
}

class Program {
  constructor(private nodes: ProgramNode[]) { }

  execute() {
    const clonedNodes = mergeObject([], this.nodes);

    const programObject: any = {
      main: clonedNodes,
    };
    for (const node of clonedNodes) {
      if (node.type === 'globals') programObject[node.data.scopeName] = node.data.properties;
    }

    const defineItemNodes: DefineItemNode[] = [];
    const templateNodes: TemplateNode[] = [];
    const tickNodes: TickNode[] = [];
    const usageNodes: UsageNode[] = [];
    const useTemplateNodes: UseTemplateNode[] = [];

    // Collect the template nodes.
    walkObject(programObject, (obj, key, value, path) => {
      if (value && value instanceof Object && value.type) {
        if (value.type === 'template') {
          templateNodes.push(value);
        }
      }
    });

    // Inherit template properties if not defined in use-template properties.
    walkObject(programObject, (obj, key, value, path) => {
      if (value && value instanceof Object && value.type) {
        if (value.type === 'use-template') {
          this.resolveUseTemplateNode(templateNodes, value);
          useTemplateNodes.push(value);
        }
      }
    });

    // Collect define-item and usage nodes.
    walkObject(programObject, (obj, key, value, path) => {
      if (value && value instanceof Object && value.type) {
        if (value.type === 'define-item') {
          defineItemNodes.push(value);
        } else if (value.type === 'usage') {
          usageNodes.push(value);
        } else if (value.type === 'tick') {
          tickNodes.push(value);
        }
      }
    });

    // Interpolate property string values.
    // ex:
    //     'Ripe $product Tree' -> 'Ripe Orange Tree'
    //     {focus: '<product>'} -> {focus: {referenceToObjectAtKeyProduct}}
    walkObject(programObject, (obj, key, value, path) => {
      if (typeof value === 'string') {
        obj[key] = this.parseString(value, {programObject, path});
      }
    });

    // Assign ids for define-item nodes.
    let id = 1;
    walkObject(programObject, (obj, key, value, path) => {
      if (value && value instanceof Object && value.type === 'define-item') {
        if (value.data.id === undefined) {
          value.data.id = id++;
        }

        return false;
      }
    });

    // Validate / lookup ids for item nodes.
    walkObject(programObject, (obj, key, value, path) => {
      if (value && value instanceof Object && value.type === 'item') {
        if (value.data.id === undefined) {
          const canonicalItem = defineItemNodes.find((node) => node.data.name === value.data.name);
          if (!canonicalItem) throw new Error(`cannot find item ${value.data.name}`);

          value.data.id = canonicalItem.data.id;
        } else {
          // TODO validate?
        }

        return false;
      }
    });

    // Replace the item nodes with just the item id.
    walkObject(programObject, (obj, key, value, path) => {
      if (value && value instanceof Object && (value.type === 'item' || value.type === 'define-item')) {
        obj[key] = value.data.id;
      }
    });

    const items: MetaItem[] = [];
    const itemUses: ItemUse[] = [];
    for (const node of defineItemNodes) {
      items.push(node.data as any);
    }
    for (const node of usageNodes) {
      const itemUse: ItemUse = node.data as any;
      itemUse.products = itemUse.products.map((product) => {
        if (typeof product === 'number') return {type: product, quantity: 1};
        return product;
      });
      itemUses.push(itemUse);
    }

    for (const node of tickNodes) {
      const from = items.find((item) => item.id === node.data.from);
      const to = items.find((item) => item.id === node.data.to);
      if (!from || !to) throw new Error('bad tick node');

      from.growthItem = to.id;
      // TODO
      from.growthDelta = 10;
      // from.growthDelta = node.data.time;
    }

    return {items, itemUses};
  }

  private resolveUseTemplateNode(templateNodes: TemplateNode[], useTemplateNode: UseTemplateNode) {
    const templateNode = templateNodes.find((t) => t.data.name === useTemplateNode.data.templateName);
    if (!templateNode) throw new Error(`no template found named ${useTemplateNode.data.templateName}`);

    const properties = mergeObject(templateNode.data.properties, useTemplateNode.data.properties);
    useTemplateNode.data.properties = properties;
  }

  private parseString(str: string, context: { programObject: any; path: string[] }) {
    function lookupIdentifier(identifier: string) {
      return resolveIdentifier(context.programObject, identifier, context.path);
    }

    if (str.startsWith('<') && str.endsWith('>')) {
      const identifier = str.substr(1, str.length - 2);

      // Special case.
      if (identifier === 'hand') return item_({name: 'hand', id: 0});

      const value = lookupIdentifier(identifier);
      return value;
    }

    if (!str.includes('$')) return str;

    let formattedString = str;
    const identifiers = str.match(/\$[a-z]+/g) || [];
    for (const identifier of identifiers) {
      let value = lookupIdentifier(identifier.substr(1));
      if (value === null) {
        throw new Error(`cannot resolve value for ${identifier}`);
      }

      if (value.type === 'define-item') value = value.data.name;
      if (value.type === 'item') value = value.data.name;
      formattedString = formattedString.replace(identifier, value);
    }

    return formattedString;
  }
}

const testProgram = [
  globals_('common', {
    gold: defineItem_({name: 'Gold'}),
    axe: defineItem_({name: 'Axe'}),
    branches: defineItem_({name: 'Branches'}),
  }),
  template_('Tree', {
    product: null, // TODO: error if not provided
    yield: 5,
    burden: 10000,
    items: {
      stump: defineItem_({name: '$product Tree Stump', burden: '<burden>'}),
      sprouting: defineItem_({name: 'Sprouting $product Tree', animations: [895], burden: '<burden>'}),
      young: defineItem_({name: 'Young $product Tree', animations: [896], burden: '<burden>'}),
      flowering: defineItem_({name: 'Flowering $product Tree', burden: '<burden>'}),
      ripening: defineItem_({name: 'Ripening $product Tree', burden: '<burden>'}),
      ripe: defineItem_({name: 'Ripe $product Tree', burden: '<burden>'}),
      dormant: defineItem_({name: 'Dormant $product Tree', burden: '<burden>'}),
    },
    time: [
      tick_('<items.stump>', '<items.sprouting>', '10 days'),
      tick_('<items.sprouting>', '<items.young>', '1 day'),
      tick_('<items.young>', '<items.flowering>', '1 day'),
      tick_('<items.flowering>', '<items.ripening>', '1 day'),
      tick_('<items.ripening>', '<items.ripe>', '6 hours'),
      tick_('<items.ripe>', '<items.dormant>', '2 days'),
    ],
    usages: [
      usage_({tool: '<hand>', focus: '<items.ripe>', products: [{type: '<product>', quantity: '<yield>'}]}),
      usage_({
        tool: '<common.axe>',
        focus: '<items.sprouting>',
        products: [
          '<items.stump>',
          {type: '<common.branches>', quantity: 1},
        ],
      }),
    ],
  }),
  useTemplate_('Tree', {
    name: 'Orange',
    product: defineItem_({name: 'Orange', animations: [511]}),
  }),
  useTemplate_('Tree', {
    name: 'Gold',
    product: '<common.gold>',
    yield: 1000,
  }),
];

const program = new Program(testProgram);
console.log(JSON.stringify(program.execute(), null, 2));
