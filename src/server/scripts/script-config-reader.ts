import fs from 'fs';

import jsonSchema from 'json-schema';

// TODO: can't get this to work with ts-node
// import schema from '../../client/ui/components/schemas.json' assert {type: 'json'};
const schema = JSON.parse(fs.readFileSync('./src/client/ui/components/schemas.json', 'utf-8'));

export function readConfig<T extends object>(
  scriptName: string, schemaType: string, configStore: object): { config: T; errors: ScriptError[] } {

  if (!(schemaType in schema.definitions)) {
    throw new Error(`missing schema definition for: ${schemaType}`);
  }

  const definition = schema.definitions[schemaType as keyof typeof schema.definitions] as jsonSchema.JSONSchema7;

  // Grab all the `{scriptName}.` prefixed values and create an un-validiated config object.
  // @ts-expect-error
  const config: T = {};
  const keyPrefix = `${scriptName}.`;
  for (const [k, v] of Object.entries(configStore)) {
    if (!k.startsWith(keyPrefix)) continue;

    // @ts-expect-error
    config[k.replace(keyPrefix, '')] = v;
  }

  // Validate.
  const result = jsonSchema.validate(config, definition);
  const errors = result.errors.map((error) => {
    return {
      text: error.message,
      data: {key: error.property},
    };
  });

  return {config, errors};
}
