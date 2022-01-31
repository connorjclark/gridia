export function readConfig<T extends ConfigDefinition>(
  scriptName: string, configDef: T, configStore: object): {config: MapConfigType<T>; errors: ScriptError[]} {

  const reader = new ScriptConfigReader(configStore);

  // @ts-expect-error
  const config: MapConfigType<T> = {};
  for (const [k, v] of Object.entries(configDef)) {
    const key = `${scriptName}.${k}`;
    if (v === 'Region') {
      // @ts-expect-error
      config[k] = reader.getRegion(key);
    } else if (v === 'CreatureSpawner') {
      // @ts-expect-error
      config[k] = reader.getCreatureSpawner(key);
    } else if (v === 'number') {
      // @ts-expect-error
      config[k] = reader.getNumber(key);
    }
  }

  const errors = reader.takeErrors();
  return {config, errors};
}

class ScriptConfigReader {
  private errors: ScriptError[] = [];

  constructor(private store: Record<string, any>) { }

  takeErrors() {
    const errors = this.errors;
    this.errors = [];
    return errors;
  }

  getNumber(key: string): number {
    const value = this.store[key];
    if (value === undefined) {
      this.errors.push({text: `no config value for ${key}`, data: {key}});
      // @ts-expect-error
      return;
    }
    if (typeof value !== 'number') {
      this.errors.push({text: `config value for ${key} should be a number`, data: {key}});
      // @ts-expect-error
      return;
    }
    return value;
  }

  getRegion(key: string): Region {
    const value = this.store[key];
    if (value === undefined) {
      this.errors.push({text: `no config value for ${key}`, data: {key}});
      // @ts-expect-error
      return;
    }

    const object = value;
    this.objCheck(key, object, [
      {key: 'width', type: 'number'},
      {key: 'height', type: 'number'},
      {key: 'w', type: 'number'},
      {key: 'x', type: 'number'},
      {key: 'y', type: 'number'},
      {key: 'z', type: 'number'},
    ]);

    return object;
  }

  getCreatureSpawner(key: string, index?: number): CreatureSpawner {
    const value = this.store[key];
    if (value === undefined) {
      this.errors.push({text: `no config value for ${key}`, data: {key}});
      // @ts-expect-error
      return;
    }
    if (index !== undefined && !Array.isArray(value)) {
      this.errors.push({text: `config value is not an array: ${key}`, data: {key}});
      // @ts-expect-error
      return;
    }

    const object = value;
    this.objCheck(key, object, [
      {key: 'limit', type: 'number'},
      {key: 'rate', type: 'object'},
      {key: 'region', type: 'object'},
      {key: 'descriptors', type: 'object'},
    ]);

    return object;
  }

  private objCheck(configKey: string, object: any, properties: Array<{key: string; type: string}>) {
    if (typeof object === 'string') {
      throw new Error(`[${configKey}] expected object, got string ${JSON.stringify(object)}`);
    }
    if (typeof object !== 'object' || object === null) throw new Error(`[${configKey}] expected object, got ${object}`);

    for (const prop of properties) {
      const value = object[prop.key];
      const type = typeof value;
      if (prop.type === 'string' && type !== 'string') {
        throw new Error(`[${configKey}] [${prop.key}] expected string, got ${type}`);
      }
      if (prop.type === 'number' && type !== 'number') {
        throw new Error(`[${configKey}] [${prop.key}] expected number, got ${type}`);
      }
    }
  }
}
