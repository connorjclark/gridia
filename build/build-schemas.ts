// yarn ts-node build/build-schemas.ts

import fs from 'fs';
import {resolve} from 'path';

import * as tsj from 'ts-json-schema-generator';

// TODO: waiting for https://github.com/vega/ts-json-schema-generator/issues/1294



const config: tsj.Config = {
  expose: 'all',
  tsconfig: resolve('./tsconfig.json'),
  skipTypeCheck: true,
};

const generator = tsj.createGenerator(config);

const types = [
  'TestObject',
  // 'Player',
  // 'BasicScriptConfig',
  // // 'HubWorldScriptConfig',
  // 'ThunderDomeScriptConfig',
];
const schemas = generator.createSchema(types[0]);
delete schemas.$ref;
for (const type of types.slice(1)) {
  const moreSchemas = generator.createSchema(type);
  schemas.definitions = {...schemas.definitions, ...moreSchemas.definitions};
}

// // @ts-expect-error
// schemas.definitions.CreatureDescriptor.properties.type['ui:widget'] = 'CreatureTypeWidget';
// // https://github.com/rjsf-team/react-jsonschema-form/issues/675
// // @ts-expect-error
// delete schemas.definitions.CreatureDescriptor.properties.partial;
// // @ts-expect-error
// delete schemas.definitions.CreatureDescriptor.properties.onSpeak;

fs.writeFileSync('./src/client/ui/components/schemas.json', JSON.stringify(schemas, null, 2));
