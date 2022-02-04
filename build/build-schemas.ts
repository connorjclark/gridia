// yarn ts-node build/build-schemas.ts

import fs from 'fs';
import {resolve} from 'path';

import * as TJS from 'typescript-json-schema';

const settings: TJS.PartialArgs = {
  // uniqueNames: true,
  required: true,
  ignoreErrors: true,
  ref: true,
  aliasRef: true,
};

const program = TJS.getProgramFromFiles([resolve('./src/types.d.ts')]);
const generator = TJS.buildGenerator(program, settings);
if (!generator) throw new Error();

const scriptConfigSymbols = generator.getSymbols().filter((s) => s.name.endsWith('ScriptConfig'));
const symbolNames = scriptConfigSymbols.map((s) => s.name);
const schemas = generator.getSchemaForSymbols(symbolNames);

// @ts-expect-error
schemas.definitions.CreatureDescriptor.properties.type['ui:widget'] = 'CreatureTypeWidget';
// https://github.com/rjsf-team/react-jsonschema-form/issues/675
// @ts-expect-error
delete schemas.definitions.CreatureDescriptor.properties.partial;
// @ts-expect-error
delete schemas.definitions.CreatureDescriptor.properties.onSpeak;

fs.writeFileSync('./src/client/ui/components/schemas.json', JSON.stringify(schemas, null, 2));
