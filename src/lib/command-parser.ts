export interface Command {
  args: Array<{name: string; type: string; optional?: boolean}>;
  help?: string;
  do(args: any): string|void;
}

export function parseArgs(input: string, args: Command['args']) {
  const result: Record<string, string|number|boolean> = {};

  // https://stackoverflow.com/questions/16261635/
  const match = input.match(/(?:[^\s"']+|['"][^'"]*["'])+/g) || [];
  const tokens = [...match];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (i >= tokens.length) {
      if (arg.optional) break;
      else return {error: `missing required argument ${arg.name}`};
    }

    if (arg.type === 'number') {
      result[arg.name] = Number(tokens[i]);
      if (Number.isNaN(result[arg.name])) return {error: `could not parse as number: ${tokens[i]}`};
    } else if (arg.type === 'string') {
      let str = tokens[i];
      if (str[0] === '\'' && str[str.length - 1] === '\'') str = str.substring(1, str.length - 1);
      else if (str[0] === '"' && str[str.length - 1] === '"') str = str.substring(1, str.length - 1);
      result[arg.name] = str;
    } else if (arg.type === 'boolean') {
      result[arg.name] = tokens[i] === 'true' || tokens[i] === '1';
    }
  }

  return result;
}

export function parseCommand(input: string) {
  const index = input.indexOf(' ');
  if (index === -1) return {commandName: input, argsString: ''};

  return {
    commandName: input.substring(0, index),
    argsString: input.substring(index + 1),
  };
}
