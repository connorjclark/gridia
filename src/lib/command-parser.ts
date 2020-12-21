export interface Command {
  args: Array<{name: string; type: string; optional?: boolean}>;
  do(args: any): string|void;
}

export function parseArgs(input: string, args: Command['args']) {
  const result: Record<string, string|number> = {};

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
    } else if (arg.type === 'string') {
      let str = tokens[i];
      if (str[0] === '\'' && str[str.length - 1] === '\'') str = str.substr(1, str.length - 2);
      else if (str[0] === '"' && str[str.length - 1] === '"') str = str.substr(1, str.length - 2);
      result[arg.name] = str;
    }
  }

  return result;
}

export function parseCommand(input: string) {
  const index = input.indexOf(' ');
  if (index === -1) return {commandName: input, argsString: ''};

  return {
    commandName: input.substr(0, index),
    argsString: input.substr(index + 1),
  };
}
