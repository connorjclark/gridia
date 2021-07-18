export class ScriptConfigStore {
  private errors: Array<{error: string; key: string}> = [];

  constructor(private store: Record<string, any>) { }

  takeErrors() {
    const errors = this.errors;
    this.errors = [];
    return errors;
  }

  getRegion(key: string): Region {
    const value = this.store[key];
    if (value === undefined) {
      this.errors.push({key, error: `no config value for ${key}`});
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
